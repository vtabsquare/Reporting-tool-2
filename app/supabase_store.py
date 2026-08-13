"""
supabase_store.py — Cloud publish/share service for VTAB Reporting Studio.

This is an ADDITIVE module. It does NOT modify existing SQLite storage.
The existing `storage.py` and all its callers are completely unchanged.
"""
from __future__ import annotations
import os, json, io, zipfile, hashlib
from typing import Optional

def _client(access_token: str = None):
    """Lazy-load Supabase client. Uses ANON KEY and the user's JWT for secure RLS access."""
    url = os.environ.get("VITE_SUPABASE_URL", "")
    key = os.environ.get("VITE_SUPABASE_ANON_KEY", "")
    if not url or not key:
        raise RuntimeError(
            "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY env vars must be set "
            "to use cloud publish features."
        )
    from supabase import create_client
    sb = create_client(url, key)
    if access_token:
        # Authenticate the Python client as the user who clicked 'Publish'
        sb.postgrest.auth(access_token)
    return sb

def _admin_client():
    """Create a Supabase client using the SERVICE ROLE KEY for admin operations."""
    url = os.environ.get("VITE_SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")
    from supabase import create_client
    return create_client(url, key)

BUCKET = "vtab-reports"

def publish_to_cloud(project: dict, access_token: str = None) -> dict:
    """
    Publish a project to Supabase.
    - Stores report metadata in the `published_reports` table.
    - Stores large analytical data in the Storage bucket.
    Returns: { id, name, published_at }
    """
    sb = _client(access_token)
    report = project.get("report") or {}
    report_id = report.get("id") or _uid()
    name = (report.get("name") or project.get("name") or "Untitled Report").strip()

    # Strip heavy data and upload to Storage separately
    project_meta = json.loads(json.dumps(project))  # deep copy
    parquet_data = project_meta.pop("_parquetData", None)
    if parquet_data:
        storage_path = f"{report_id}/data.json"
        sb.storage.from_(BUCKET).upload(
            storage_path,
            json.dumps(parquet_data).encode("utf-8"),
            {"content-type": "application/json", "upsert": "true"}
        )
        project_meta["_parquetStoragePath"] = storage_path

    res = sb.rpc("publish_report_for_user", {
        "p_report_id": report_id,
        "p_name": name,
        "p_project_json": json.dumps(project_meta),
    }).execute()
    data = res.data or {}
    if isinstance(data, dict) and data.get("error"):
        raise PermissionError(data["error"])
    return {"id": data.get("id", report_id), "name": data.get("name", name), "published_at": data.get("published_at")}


def grant_owner(report_id: str, user_id: str, access_token: str = None) -> None:
    """
    Auto-called after publish — grants the publisher 'Owner' role on their report.
    """
    sb = _client(access_token)
    sb.table("report_access_grants").upsert({
        "report_id": report_id,
        "user_id": user_id,
        "role": "Owner"
    }).execute()

def grant_access(report_id: str, email: str, role: str, granter_user_id: str, access_token: str = None) -> dict:
    """
    Grant a registered Supabase user access to a report.
    """
    if role not in ("Viewer", "Co-Owner"):
        raise ValueError("role must be 'Viewer' or 'Co-Owner'")
    sb = _client(access_token)

    # Call the secure Postgres RPC to lookup the user by email and grant access.
    # This bypasses the need for the Python backend to have full auth.admin privileges.
    res = sb.rpc("share_report_by_email", {
        "p_report_id": report_id,
        "p_target_email": email,
        "p_role": role,
        "p_granter_id": granter_user_id
    }).execute()

    if res.data and "error" in res.data:
        if "Only Co-Owners" in res.data["error"]:
            raise PermissionError(res.data["error"])
        raise ValueError(res.data["error"])

    return {"ok": True, "email": email, "role": role}

def list_accessible_reports(user_id: str) -> list:
    """List all reports the given Supabase user has been granted access to."""
    sb = _client()
    grants = sb.table("report_access_grants") \
        .select("report_id, role") \
        .eq("user_id", user_id) \
        .execute()
    if not grants.data:
        return []
    report_ids = [g["report_id"] for g in grants.data]
    role_map = {g["report_id"]: g["role"] for g in grants.data}

    reports = sb.table("published_reports") \
        .select("id, name, published_at, project_json") \
        .in_("id", report_ids) \
        .order("published_at", desc=True) \
        .execute()

    out = []
    for r in (reports.data or []):
        meta = json.loads(r.get("project_json") or "{}")
        report_obj = meta.get("report") or {}
        pages = report_obj.get("pages") or []
        out.append({
            "id": r["id"],
            "name": r["name"],
            "published_at": r["published_at"],
            "pages": len(pages),
            "role": role_map.get(r["id"], "Viewer")
        })
    return out


# ── Package Upload ──────────────────────────────────────────────────────────────

def upload_package(file_bytes: bytes, filename: str, user_id: str, access_token: str = None) -> dict:
    """
    Upload a .vtabapp / .vtabpkg file to the cloud.
    Parses the zip, extracts project JSON, stores as a published_report,
    and grants Owner access to the uploader.
    """
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext not in ('vtabapp', 'vtabpkg', 'vtabdata'):
        raise ValueError(f'Unsupported file type: .{ext}. Upload .vtabapp, .vtabpkg, or .vtabdata files.')

    # Parse the package zip
    try:
        zf = zipfile.ZipFile(io.BytesIO(file_bytes), 'r')
    except zipfile.BadZipFile:
        raise ValueError('Invalid package file. Could not read as ZIP archive.')

    # Find the manifest and project JSON
    manifest = None
    project_json = None
    for name in zf.namelist():
        if name.endswith('manifest.json'):
            manifest = json.loads(zf.read(name))
        if name.endswith('project.json'):
            project_json = json.loads(zf.read(name))

    if not project_json:
        raise ValueError('Package does not contain a project.json file.')

    # Build report metadata
    report = project_json.get('report') or {}
    report_id = report.get('id') or _uid()
    name = (report.get('name') or project_json.get('name') or filename.rsplit('.', 1)[0] or 'Uploaded Report').strip()

    # Use admin client for publishing (service role bypasses RLS)
    sb = _admin_client()

    # Upsert published report
    sb.table('published_reports').upsert({
        'id': report_id,
        'name': name,
        'project_json': json.dumps(project_json),
        'published_at': 'now()',
        'updated_at': 'now()',
    }, on_conflict='id').execute()

    # Grant Owner access
    sb.table('report_access_grants').upsert({
        'report_id': report_id,
        'user_id': user_id,
        'role': 'Owner',
    }).execute()

    return {
        'ok': True,
        'id': report_id,
        'name': name,
        'format': f'.{ext}',
        'pages': len(report.get('pages') or []),
    }


# ── Workspaces ──────────────────────────────────────────────────────────────────

def create_workspace(name: str, user_id: str) -> dict:
    """Create a new workspace and add the creator as Admin."""
    sb = _admin_client()
    res = sb.table('workspaces').insert({
        'name': name.strip(),
        'created_by': user_id,
    }).execute()
    ws = res.data[0] if res.data else {}
    ws_id = ws.get('id')
    if not ws_id:
        raise RuntimeError('Failed to create workspace.')
    # Add creator as Admin member
    sb.table('workspace_members').upsert({
        'workspace_id': ws_id,
        'user_id': user_id,
        'role': 'Admin',
    }).execute()
    return {'id': ws_id, 'name': ws.get('name'), 'created_at': ws.get('created_at'), 'role': 'Admin'}

def delete_workspace(workspace_id: str, user_id: str) -> dict:
    """Delete a workspace if the user is an Admin or Creator."""
    sb = _admin_client()
    ws = sb.table('workspaces').select('created_by').eq('id', workspace_id).execute()
    is_creator = bool(ws.data and ws.data[0].get('created_by') == user_id)

    mem = sb.table('workspace_members').select('role').eq('workspace_id', workspace_id).eq('user_id', user_id).execute()
    is_admin = bool(mem.data and mem.data[0]['role'] == 'Admin')
    
    if not is_creator and not is_admin:
        raise PermissionError('Only workspace Admins can delete this workspace.')

    sb.table('workspaces').delete().eq('id', workspace_id).execute()
    return {'ok': True, 'id': workspace_id}


def list_workspaces(user_id: str) -> list:
    """List all workspaces the user is a member of or created."""
    sb = _admin_client()
    memberships = sb.table('workspace_members').select('workspace_id, role').eq('user_id', user_id).execute()
    created = sb.table('workspaces').select('id').eq('created_by', user_id).execute()
    
    ws_map = {}
    for c in (created.data or []):
        ws_map[c['id']] = 'Admin'
    for m in (memberships.data or []):
        if m['workspace_id'] not in ws_map or m['role'] == 'Admin':
            ws_map[m['workspace_id']] = m['role']
            
    if not ws_map:
        return []
        
    workspaces = sb.table('workspaces').select('id, name, created_at, created_by').in_('id', list(ws_map.keys())).execute()
    if not workspaces.data:
        return []

    # Get counts
    mem_counts = sb.table('workspace_members').select('workspace_id', count='exact').in_('workspace_id', list(ws_map.keys())).execute()
    rep_counts = sb.table('workspace_reports').select('workspace_id', count='exact').in_('workspace_id', list(ws_map.keys())).execute()
    
    mc = {}
    for row in (mem_counts.data or []):
        mc[row['workspace_id']] = mc.get(row['workspace_id'], 0) + 1
    rc = {}
    for row in (rep_counts.data or []):
        rc[row['workspace_id']] = rc.get(row['workspace_id'], 0) + 1

    res = []
    for w in workspaces.data:
        wid = w['id']
        role = 'Admin' if w['created_by'] == user_id else ws_map.get(wid, 'Member')
        res.append({
            'id': wid, 'name': w['name'], 'created_at': w['created_at'],
            'role': role,
            'member_count': mc.get(wid, 0),
            'report_count': rc.get(wid, 0)
        })
    return res

def get_workspace_detail(workspace_id: str, user_id: str) -> dict:
    """Get workspace details including members and reports."""
    sb = _admin_client()

    ws = sb.table('workspaces') \
        .select('id, name, created_at, created_by') \
        .eq('id', workspace_id) \
        .execute()
    if not ws.data:
        raise ValueError('Workspace not found.')
        
    is_creator = (ws.data[0].get('created_by') == user_id)

    # Verify membership
    mem = sb.table('workspace_members') \
        .select('role') \
        .eq('workspace_id', workspace_id) \
        .eq('user_id', user_id) \
        .execute()
    
    if not is_creator and not mem.data:
        raise PermissionError('You are not a member of this workspace.')
        
    role = 'Admin' if is_creator else mem.data[0]['role']

    # Get members with emails
    members = sb.table('workspace_members') \
        .select('user_id, role, added_at') \
        .eq('workspace_id', workspace_id) \
        .execute()

    # Get member emails via admin auth API
    member_list = []
    import urllib.request, base64
    url_base = os.environ.get('VITE_SUPABASE_URL', '').rstrip('/')
    svc_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    for m in (members.data or []):
        email = m['user_id']  # fallback
        if url_base and svc_key:
            try:
                req = urllib.request.Request(
                    f"{url_base}/auth/v1/admin/users/{m['user_id']}",
                    headers={'apikey': svc_key, 'Authorization': f'Bearer {svc_key}'}
                )
                with urllib.request.urlopen(req, timeout=10) as r:
                    user_data = json.loads(r.read().decode('utf-8'))
                    email = user_data.get('email', m['user_id'])
            except Exception:
                pass
        member_list.append({
            'user_id': m['user_id'],
            'email': email,
            'role': m['role'],
            'added_at': m['added_at'],
        })

    # Get reports in workspace
    ws_reports = sb.table('workspace_reports') \
        .select('report_id, shared_at') \
        .eq('workspace_id', workspace_id) \
        .execute()

    report_list = []
    if ws_reports.data:
        rids = [wr['report_id'] for wr in ws_reports.data]
        reports = sb.table('published_reports') \
            .select('id, name, published_at') \
            .in_('id', rids) \
            .execute()
        shared_map = {wr['report_id']: wr['shared_at'] for wr in ws_reports.data}
        for rpt in (reports.data or []):
            report_list.append({
                'id': rpt['id'],
                'name': rpt['name'],
                'published_at': rpt['published_at'],
                'shared_at': shared_map.get(rpt['id']),
            })

    return {
        **ws.data[0],
        'role': mem.data[0]['role'],
        'members': member_list,
        'reports': report_list,
    }

def add_workspace_member(workspace_id: str, email: str, role: str, granter_id: str) -> dict:
    """Add a registered user to a workspace by email."""
    if role not in ('Admin', 'Member'):
        raise ValueError("role must be 'Admin' or 'Member'")
    sb = _admin_client()

    # Check granter is Admin
    granter = sb.table('workspace_members') \
        .select('role') \
        .eq('workspace_id', workspace_id) \
        .eq('user_id', granter_id) \
        .execute()
    if not granter.data or granter.data[0]['role'] != 'Admin':
        raise PermissionError('Only workspace Admins can add members.')

    # Lookup user by email via Supabase Admin API
    import urllib.request
    url_base = os.environ.get('VITE_SUPABASE_URL', '').rstrip('/')
    svc_key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url_base or not svc_key:
        raise RuntimeError('SUPABASE_SERVICE_ROLE_KEY is required to add members.')

    try:
        req = urllib.request.Request(
            f"{url_base}/auth/v1/admin/users",
            headers={'apikey': svc_key, 'Authorization': f'Bearer {svc_key}'}
        )
        with urllib.request.urlopen(req, timeout=20) as r:
            all_users = json.loads(r.read().decode('utf-8'))
    except Exception as e:
        raise RuntimeError(f'Failed to lookup users: {e}')

    target_user = None
    users_list = all_users.get('users', all_users) if isinstance(all_users, dict) else all_users
    for u in users_list:
        if (u.get('email') or '').lower() == email.strip().lower():
            target_user = u
            break

    if not target_user:
        raise ValueError(f'No registered user found with email: {email}')

    target_uid = target_user['id']

    # Add to workspace
    sb.table('workspace_members').upsert({
        'workspace_id': workspace_id,
        'user_id': target_uid,
        'role': role,
    }).execute()

    # Also grant access to all reports already in this workspace
    ws_reports = sb.table('workspace_reports') \
        .select('report_id') \
        .eq('workspace_id', workspace_id) \
        .execute()
    for wr in (ws_reports.data or []):
        sb.table('report_access_grants').upsert({
            'report_id': wr['report_id'],
            'user_id': target_uid,
            'role': 'Viewer',
        }).execute()

    return {'ok': True, 'email': email, 'role': role, 'user_id': target_uid}

def share_report_to_workspace(report_id: str, workspace_id: str, granter_id: str) -> dict:
    """Share a report into a workspace, granting access to all current members."""
    sb = _admin_client()

    # Check granter is Admin
    granter = sb.table('workspace_members') \
        .select('role') \
        .eq('workspace_id', workspace_id) \
        .eq('user_id', granter_id) \
        .execute()
    if not granter.data or granter.data[0]['role'] != 'Admin':
        raise PermissionError('Only workspace Admins can share reports.')

    # Add to workspace_reports
    sb.table('workspace_reports').upsert({
        'workspace_id': workspace_id,
        'report_id': report_id,
    }).execute()

    # Grant access to all workspace members
    members = sb.table('workspace_members') \
        .select('user_id') \
        .eq('workspace_id', workspace_id) \
        .execute()
    count = 0
    for m in (members.data or []):
        sb.table('report_access_grants').upsert({
            'report_id': report_id,
            'user_id': m['user_id'],
            'role': 'Viewer',
        }).execute()
        count += 1

    return {'ok': True, 'members_granted': count}


def _uid():
    import uuid
    return str(uuid.uuid4())
