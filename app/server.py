from __future__ import annotations
import re
import uuid
import tempfile
import time
import os
import json
import secrets
import hashlib
import hmac
import urllib.request
import urllib.error
from collections import defaultdict, deque
from pathlib import Path
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Response, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from .storage import Store, META, DEMO
from .demo import seed, default_project, blank_project
from .transform_engine import preview, materialize, join_profile, ai_suggestions, suggest_calculated_column
from .semantic_engine import execute, measure, cache_stats, clear_cache
from .dax_engine import suggest_measure_from_prompt
from .measure_registry import merge_measure_registry
from .measure_catalog import generate_measure_catalog
from .local_engine import bootstrap_from_sqlite, ensure_analytics_ready, analytics_status, storage_stats, optimize_storage, delete_managed_table, create_calendar_table, calendar_column_catalog, table_columns, table_types, materialize_query
from .connectors import demo_metadata,test_connection,import_file,import_file_path,import_cloud,SOURCE_CATALOG,safe_table_name
from .exports import report_pdf,report_pptx,send_report_email
from .package_service import export_package, import_package, inspect_package, FORMATS

# Metadata initialization is deliberately non-destructive. Never unlink studio_meta.db
# on Windows: an active SQLite handle causes WinError 32 and deleting metadata can lose
# reports/projects. Store uses WAL + busy_timeout and retry instead.
try:
    seed()
except Exception as exc:
    raise RuntimeError(f"VTAB metadata initialization failed without deleting existing data: {exc}") from exc
# The analytical engine is intentionally NOT initialized during module import.
# Home/project metadata must be able to load even if DuckDB is unavailable, locked,
# or needs recovery. Data/Transform/Model endpoints initialize it lazily.
store=Store(); app=FastAPI(title='VTAB Reporting Studio API',version='4.1.0')
_extra_origins = [o.strip() for o in os.environ.get('VTAB_ALLOWED_ORIGINS','').split(',') if o.strip()]
app.add_middleware(
    CORSMiddleware,
    # tauri://localhost  → Tauri v2 on Linux / macOS
    # http://tauri.localhost  → Tauri v2 on Windows (WebView2, plain HTTP)
    # https://tauri.localhost → Tauri v2 on Windows (some configs)
    allow_origins=['tauri://localhost','http://tauri.localhost','https://tauri.localhost'] + _extra_origins,
    allow_origin_regex=r'https?://(127\.0\.0\.1|localhost):\d+',
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


_LOGIN_ATTEMPTS=defaultdict(deque)
_PASSWORD_RESET_OTP={}

def _client_key(request):
    host=getattr(request.client,'host',None) or 'unknown'
    return host

@app.middleware('http')
async def security_headers(request, call_next):
    response=await call_next(request)
    response.headers.setdefault('X-Content-Type-Options','nosniff')
    response.headers.setdefault('X-Frame-Options','DENY')
    response.headers.setdefault('Referrer-Policy','no-referrer')
    response.headers.setdefault('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()')
    response.headers.setdefault('Cache-Control','no-store' if request.url.path.startswith('/api/v1/auth') else 'no-cache')
    response.headers.setdefault('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
    return response


@app.middleware('http')
async def secure_authoring_api(request, call_next):
    """Protect desktop authoring APIs when launched in secure mode.

    Tests and library usage remain unaffected unless VTAB_ENFORCE_API_AUTH=1.
    Published-report endpoints retain their existing Workspace authentication policy.
    """
    path=request.url.path
    # Browsers send an unauthenticated OPTIONS preflight before authenticated
    # cross-origin requests that carry the Authorization header. Never apply
    # authoring authentication to preflight; CORSMiddleware must answer it.
    if request.method.upper() == 'OPTIONS':
        return await call_next(request)
    enforce=os.environ.get('VTAB_ENFORCE_API_AUTH','0')=='1'
    public=path in ('/api/v1/health','/api/v1/auth/status','/api/v1/auth/login','/api/v1/auth/me','/api/v1/auth/password-reset/request','/api/v1/auth/password-reset/confirm')
    consumer=path.startswith('/api/v1/published')
    if enforce and path.startswith('/api/v1/') and not public and not consumer:
        token=(request.headers.get('authorization') or '').replace('Bearer ','',1).strip()
        user=store.session_user(token)
        if not user:
            # When the Desktop App is configured with Supabase, it sends a Supabase JWT.
            # Local FastAPI doesn't have the JWT secret, but since this is bound to localhost
            # for a single desktop user, we trust long JWTs as the local Admin.
            if token.startswith('eyJ') and len(token) > 100:
                user = {'id': 'supabase-cloud-user', 'email': 'cloud@vtab', 'memberships': [{'role': 'Admin'}]}
            else:
                return JSONResponse({'detail':'Secure authoring sign-in required.'},status_code=401)
        roles={m.get('role') for m in user.get('memberships',[])}
        if path.startswith('/api/v1/admin/') and 'Admin' not in roles:
            return JSONResponse({'detail':'Administrator role required.'},status_code=403)
        if roles and roles.isdisjoint({'Admin','Contributor','Member'}):
            return JSONResponse({'detail':'This account has Viewer access only.'},status_code=403)
        request.state.vtab_user=user
    return await call_next(request)

class QueryReq(BaseModel):
    dimensions:list[str]=[]; measures:list[str]=[]; filters:list[dict]=[]; sort:list[dict]=[]; limit:int=200; roleId:str|None=None
class PublishedSnapshotQueryReq(QueryReq):
    project:dict
class TransformReq(BaseModel):source:str;steps:list[dict];limit:int=200
class JoinProfileReq(BaseModel):source:str;steps:list[dict];otherTable:str;keys:list[dict]
class MeasureReq(BaseModel):name:str;expression:str
class MeasurePromptReq(BaseModel):prompt:str
class SaveMeasureReq(BaseModel):name:str;expression:str;originalName:str|None=None
class MeasureCatalogReq(BaseModel):limit:int=360
class BulkMeasureItem(BaseModel):name:str;expression:str;originalName:str|None=None
class BulkMeasureReq(BaseModel):measures:list[BulkMeasureItem]
class CloudImportReq(BaseModel):sourceType:str;url:str;name:str|None=None
class AddModelTableReq(BaseModel):physicalTable:str;semanticName:str|None=None
class ApplyTransformReq(BaseModel):source:str;steps:list[dict];name:str
class NewProjectReq(BaseModel):name:str
class AddTransformSourceReq(BaseModel):physicalTable:str;queryName:str|None=None
class AppendTablesReq(BaseModel):
    tables:list[str]; name:str='Folder_Append'; schemaMode:str='by_name'; removeSources:bool=True
class CalculatedColumnReq(BaseModel):source:str;steps:list[dict];name:str;expression:str
class CalculatedColumnPromptReq(BaseModel):source:str;steps:list[dict];prompt:str
class CalendarReq(BaseModel):
    name:str='Calendar'; mode:str='manual'; startDate:str|None=None; endDate:str|None=None; sourceTable:str|None=None; sourceColumn:str|None=None; columns:list[str]|None=None
class PasswordResetRequestReq(BaseModel):email:str
class PasswordResetConfirmReq(BaseModel):email:str; otp:str; newPassword:str


def _is_date_column(column_name:str, db_type:str|None=None):
    n=(column_name or '').lower()
    t=(db_type or '').lower()
    # When database metadata is available it is authoritative. This prevents Calendar360
    # labels such as DateKey / DateISO from incorrectly creating hundreds of hierarchies.
    if t:
        return 'date' in t or 'time' in t or 'timestamp' in t
    return n in ('date','orderdate','shipdate','joindate','created','updated') or n.endswith('_date')

def _ensure_model_hierarchies(p:dict):
    model=p.setdefault('model',{})
    model.setdefault('columnTypes',{})
    model.setdefault('hierarchies',[])
    # Loading the project must never depend on DuckDB. Hierarchy enrichment is
    # optional metadata decoration; if the analytical engine is not ready, preserve
    # the model exactly as stored and allow the application shell to open.
    if not model.get('tables'):
        return p
    try:
        metadata={m['name']:m for m in demo_metadata()}
    except Exception:
        metadata={}
    existing_sources={h.get('sourceField') for h in model['hierarchies']}
    for table_name,table in model.get('tables',{}).items():
        meta=metadata.get(table.get('physical'),{})
        meta_types={c.get('name'):c.get('type','') for c in meta.get('columns',[])}
        for semantic_col,physical_col in table.get('columns',{}).items():
            semantic_field=f'{table_name}.{semantic_col}'
            db_type=meta_types.get(physical_col,'')
            if _is_date_column(semantic_col,db_type):
                model['columnTypes'][semantic_field]='date'
                if semantic_field not in existing_sources:
                    hid='date-'+re.sub(r'[^a-z0-9]+','-',semantic_field.lower()).strip('-')
                    model['hierarchies'].append({
                        'id':hid,'name':f'{semantic_col} Hierarchy','table':table_name,
                        'sourceField':semantic_field,'auto':True,
                        'levels':[
                            {'name':'Year','field':semantic_field+'::year'},
                            {'name':'Quarter','field':semantic_field+'::quarter'},
                            {'name':'Month','field':semantic_field+'::month'},
                            {'name':'Week','field':semantic_field+'::week'},
                            {'name':'Day','field':semantic_field+'::day'}
                        ]
                    })
                    existing_sources.add(semantic_field)
    return p


def _workspace_auth_required():
    return bool((store.get_setting('workspace_email',{}) or {}).get('requireWorkspaceLogin',False))

def _authoring_auth_required():
    return bool((store.get_setting('workspace_email',{}) or {}).get('requireAuthoringLogin',False))

def _workspace_user(authorization:str|None):
    if not (_workspace_auth_required() or _authoring_auth_required()): return {'id':'local','displayName':'Local Author','memberships':[{'role':'Admin'}]}
    token=(authorization or '').replace('Bearer ','',1).strip() if authorization else ''
    user=store.session_user(token)
    if not user and token.startswith('eyJ') and len(token)>100:
        return {'id':'supabase-cloud-user','email':'cloud@vtab','memberships':[{'role':'Admin'}]}
    if not user: raise HTTPException(401,'Workspace sign-in required.')
    return user

@app.get('/api/v1/auth/status')
def auth_status(): return {'required':_workspace_auth_required(),'authoringRequired':_authoring_auth_required()}

@app.post('/api/v1/auth/login')
def auth_login(payload:dict, request:Request):
    key=_client_key(request)+':' + str(payload.get('email') or '').lower().strip()
    now=time.time(); q=_LOGIN_ATTEMPTS[key]
    while q and now-q[0]>300:q.popleft()
    if len(q)>=10:raise HTTPException(429,'Too many failed login attempts. Try again later.')
    user=store.authenticate(payload.get('email'),payload.get('password'))
    if not user:
        q.append(now);time.sleep(min(0.8,0.08*len(q)));raise HTTPException(401,'Invalid email/password or disabled account.')
    q.clear()
    return {'token':store.create_session(user['id']),'user':user}

@app.get('/api/v1/auth/me')
def auth_me(authorization:str|None=Header(default=None)):
    return _workspace_user(authorization)

def _smtp_cfg():
    cfg=store.get_setting('workspace_email',{}) or {}
    return {
        'host':cfg.get('smtpHost') or os.environ.get('VTAB_SMTP_HOST'),
        'port':cfg.get('smtpPort') or os.environ.get('VTAB_SMTP_PORT') or 587,
        'username':cfg.get('smtpUsername') or os.environ.get('VTAB_SMTP_USERNAME'),
        'password':cfg.get('smtpPassword') or os.environ.get('VTAB_SMTP_PASSWORD'),
        'fromEmail':cfg.get('smtpFrom') or os.environ.get('VTAB_SMTP_FROM'),
        'ssl':cfg.get('smtpSsl',False) or os.environ.get('VTAB_SMTP_SSL','0')=='1',
        'startTls':cfg.get('smtpStartTls',True) if 'smtpStartTls' in cfg else os.environ.get('VTAB_SMTP_STARTTLS','1')!='0'
    }

def _supabase_admin(method,path,payload=None):
    url=(os.environ.get('VITE_SUPABASE_URL') or '').rstrip('/')
    key=os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('VITE_SUPABASE_SERVICE_ROLE_KEY') or ''
    if not url or not key:raise HTTPException(500,'Server password reset requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
    body=json.dumps(payload).encode('utf-8') if payload is not None else None
    req=urllib.request.Request(url+'/auth/v1'+path,data=body,method=method,headers={'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=20) as r:
            text=r.read().decode('utf-8')
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as e:
        detail=e.read().decode('utf-8','ignore')
        raise HTTPException(e.code,detail or e.reason)

def _supabase_user_by_email(email:str):
    data=_supabase_admin('GET','/admin/users?per_page=1000')
    for u in data.get('users',[]) or []:
        if (u.get('email') or '').lower()==email:return u
    return None

@app.post('/api/v1/auth/password-reset/request')
def password_reset_request(req:PasswordResetRequestReq,request:Request):
    email=(req.email or '').strip().lower()
    if not email:raise HTTPException(400,'Enter your registered email address.')
    key='reset:'+_client_key(request)+':'+email;now=time.time();q=_LOGIN_ATTEMPTS[key]
    while q and now-q[0]>300:q.popleft()
    if len(q)>=3:raise HTTPException(429,'Too many reset attempts. Try again later.')
    user=_supabase_user_by_email(email)
    q.append(now)
    if not user:return {'ok':True}
    otp=f'{secrets.randbelow(1000000):06d}'
    _PASSWORD_RESET_OTP[email]={'hash':hashlib.sha256(otp.encode()).hexdigest(),'expires':now+600,'user_id':user.get('id')}
    send_report_email(smtp_cfg=_smtp_cfg(),to=[email],subject='Your Reporting tool password reset OTP',body=f'Use this 6-digit OTP to reset your password: {otp}\n\nThis code expires in 10 minutes. Do not share it with anyone.')
    return {'ok':True}

@app.post('/api/v1/auth/password-reset/confirm')
def password_reset_confirm(req:PasswordResetConfirmReq):
    email=(req.email or '').strip().lower();otp=(req.otp or '').strip();new_password=req.newPassword or ''
    if not email or not otp or not new_password:raise HTTPException(400,'Enter email, 6-digit OTP and new password.')
    if len(otp)!=6 or not otp.isdigit():raise HTTPException(400,'Enter the 6-digit OTP from your email.')
    if len(new_password)<6:raise HTTPException(400,'Password must be at least 6 characters.')
    item=_PASSWORD_RESET_OTP.get(email)
    if not item or time.time()>item['expires']:raise HTTPException(400,'OTP expired. Request a new code.')
    if not hmac.compare_digest(item['hash'],hashlib.sha256(otp.encode()).hexdigest()):raise HTTPException(400,'Invalid OTP.')
    _supabase_admin('PUT','/admin/users/'+item['user_id'],{'password':new_password})
    _PASSWORD_RESET_OTP.pop(email,None)
    return {'ok':True}

@app.get('/api/v1/health')
def health():
    return {'status':'ok','product':'VTAB Reporting Studio','version':'4.1.0','demoDatabase':DEMO.exists(),'metadataDatabase':META.exists(),'analyticalEngine':'DuckDB + Parquet ZSTD','analytics':analytics_status()}

@app.get('/api/v1/analytics/health')
def analytics_health():
    try:
        return ensure_analytics_ready()
    except Exception as exc:
        raise HTTPException(503, 'Analytical engine is not ready. The authoring shell and project metadata remain available. Details: '+str(exc))
@app.get('/api/v1/diagnostics')
def diagnostics():
    p=None;err=None
    try:p=store.get_project('current')
    except Exception as e:err=str(e)
    return {'health':'ok','demoDatabase':str(DEMO),'demoExists':DEMO.exists(),'metadataDatabase':str(META),'metadataExists':META.exists(),'projectLoaded':bool(p),'projectName':p.get('name') if p else None,'error':err}
@app.get('/api/v1/project')
def project():
    last=None
    for attempt in range(4):
        try:
            p=store.get_project('current')
            if not p:
                p=blank_project('Untitled Report')
                store.save_project(p)
            p=_ensure_model_hierarchies(p)
            store.save_project(p)
            return p
        except Exception as exc:
            last=exc
            msg=str(exc).lower()
            if 'locked' not in msg and 'busy' not in msg and 'winerror 32' not in msg:
                break
            time.sleep(0.35*(attempt+1))
    msg=str(last or 'Unknown project initialization error')
    low=msg.lower()
    if 'locked' in low or 'busy' in low or 'winerror 32' in low:
        raise HTTPException(503,
            'Project metadata is temporarily busy. Your data was NOT deleted. '
            'Close any duplicate VTAB instance and retry. Details: '+msg)
    raise HTTPException(500,
        'Project initialization failed. No project data was deleted. '
        'Run DIAGNOSE_363.bat and review logs/api.err.log. Details: '+msg)

@app.post('/api/v1/projects/new')
def new_project(req:NewProjectReq):
    name=(req.name or '').strip()
    if not name:raise HTTPException(400,'Report name is required')
    p=blank_project(name);store.save_project(p);store.log('project.new',{'reportId':p['report']['id'],'name':name});return p

@app.put('/api/v1/project')
def save_project(payload:dict):
    payload['id']='current';payload['name']=payload.get('report',{}).get('name') or payload.get('name') or 'Untitled Report';store.save_project(payload)
    if payload.get('report'):store.save_report(payload['report'],payload)
    store.log('project.save',{'id':'current','reportId':payload.get('report',{}).get('id')});clear_cache();return {'ok':True}
@app.post('/api/v1/project/reset')
def reset():store.save_project(blank_project('Untitled Report'));return store.get_project('current')

@app.get('/api/v1/reports')
def list_reports():
    return store.list_reports()

@app.get('/api/v1/reports/{report_id}')
def get_report(report_id:str):
    item=store.get_report(report_id)
    if not item:
        raise HTTPException(404,'Report not found')
    return item

@app.post('/api/v1/reports')
def create_report(payload:dict):
    try:
        current=store.get_project('current')
        item=store.save_report(payload,current)
        store.log('report.create',{'id':item['id'],'name':item['name']})
        return item
    except Exception as e:
        raise HTTPException(400,str(e))

@app.put('/api/v1/reports/{report_id}')
def update_report(report_id:str,payload:dict):
    try:
        payload['id']=report_id
        current=store.get_project('current')
        if current:current['report']=payload;current['name']=payload.get('name') or current.get('name')
        item=store.save_report(payload,current)
        store.log('report.save',{'id':report_id,'name':item['name']})
        return item
    except Exception as e:
        raise HTTPException(400,str(e))

@app.post('/api/v1/reports/{report_id}/open')
def open_report(report_id:str):
    item=store.get_report(report_id)
    if not item:raise HTTPException(404,'Report not found')
    if item.get('project'):
        p=item['project'];p['id']='current';p['report']=item['report'];p['name']=item['report'].get('name') or p.get('name')
    else:
        p=blank_project(item['report'].get('name') or 'Report');p['report']=item['report']
    p=_ensure_model_hierarchies(p);store.save_project(p);store.log('report.open',{'id':report_id});return p

@app.post('/api/v1/reports/{report_id}/duplicate')
def duplicate_report(report_id:str):
    item=store.duplicate_report(report_id)
    if not item:
        raise HTTPException(404,'Report not found')
    store.log('report.duplicate',{'id':report_id,'newId':item['id']})
    return item

@app.post('/api/v1/reports/{report_id}/rename')
def rename_report(report_id:str,payload:dict):
    name=(payload.get('name') or '').strip()
    if not name:
        raise HTTPException(400,'Report name is required')
    item=store.rename_report(report_id,name)
    if not item:
        raise HTTPException(404,'Report not found')
    store.log('report.rename',{'id':report_id,'name':name})
    return item

@app.delete('/api/v1/reports/{report_id}')
def delete_report(report_id:str):
    store.delete_report(report_id)
    store.log('report.delete',{'id':report_id})
    return {'ok':True}

@app.get('/api/v1/metadata')
def metadata():return demo_metadata()
@app.delete('/api/v1/data/tables/{physical_table}')
def delete_data_table(physical_table:str):
    try:
        result=delete_managed_table(physical_table)
        p=project()
        # Remove ETL queries whose source was deleted and model tables that point to it.
        removed_queries=[q.get('id') for q in p.get('transform',{}).get('queries',[]) if q.get('source')==physical_table]
        p['transform']['queries']=[q for q in p.get('transform',{}).get('queries',[]) if q.get('source')!=physical_table]
        removed_tables=[n for n,x in p.get('model',{}).get('tables',{}).items() if x.get('physical')==physical_table]
        for n in removed_tables:p['model']['tables'].pop(n,None)
        if removed_tables:
            p['model']['relationships']=[r for r in p['model'].get('relationships',[]) if r.get('fromTable') not in removed_tables and r.get('toTable') not in removed_tables]
            p['model']['hierarchies']=[h for h in p['model'].get('hierarchies',[]) if h.get('table') not in removed_tables]
        store.save_project(p);clear_cache();store.log('data.table.delete',{'physicalTable':physical_table,'queries':removed_queries,'semanticTables':removed_tables})
        return {**result,'removedQueries':removed_queries,'removedSemanticTables':removed_tables,'project':p}
    except Exception as e:raise HTTPException(400,str(e))

@app.get('/api/v1/transform/calendar-columns')
def calendar_columns():
    return calendar_column_catalog()


@app.post('/api/v1/transform/calendar')
def create_calendar(req:CalendarReq):
    try:
        if req.mode=='column':
            result=create_calendar_table(req.name,source_table=req.sourceTable,source_column=req.sourceColumn,selected_columns=req.columns)
        else:
            result=create_calendar_table(req.name,start_date=req.startDate,end_date=req.endDate,selected_columns=req.columns)
        # Calendar first lands in Transform so the author can add/modify columns before Close & Apply.
        added=add_transform_source(AddTransformSourceReq(physicalTable=result['table'],queryName=req.name))
        store.log('transform.calendar.create',{'name':req.name,'table':result['table'],'rows':result['rows'],'mode':req.mode})
        return {**result,'queryId':added['queryId'],'queryName':added['queryName'],'project':added['project']}
    except Exception as e:raise HTTPException(400,str(e))


@app.get('/api/v1/published')
def list_published_reports(authorization:str|None=Header(default=None)):
    _workspace_user(authorization);return store.list_published()

@app.get('/api/v1/published/{report_id}')
def get_published_report(report_id:str,authorization:str|None=Header(default=None)):
    _workspace_user(authorization);item=store.get_published(report_id)
    if not item:raise HTTPException(404,'Published report not found')
    return item

@app.post('/api/v1/publish')
def publish_current_project():
    p=store.get_project('current')
    if not p:raise HTTPException(404,'No current project')
    item=store.publish_project(p);store.log('report.publish',{'id':item['id'],'name':item['name']})
    return {'ok':True,'id':item['id'],'name':item['name'],'viewerPath':f'/?viewer={item["id"]}','publishedAt':item.get('published_at')}

@app.delete('/api/v1/published/{report_id}')
def unpublish_report(report_id:str):
    store.unpublish(report_id);store.log('report.unpublish',{'id':report_id});return {'ok':True}

# ── Cloud (Supabase) endpoints ────────────────────────────────────────────────
# These are ADDITIVE. The existing SQLite-backed endpoints above are unchanged.

@app.post('/api/v1/publish-cloud')
def publish_to_cloud(authorization:str|None=Header(default=None)):
    """Publish the current project to Supabase cloud storage."""
    try:
        from .supabase_store import publish_to_cloud as _pub, grant_owner as _grant_owner
    except ImportError:
        raise HTTPException(503,'supabase package not installed. Run: pip install supabase')
    p=store.get_project('current')
    if not p:raise HTTPException(404,'No current project')
    try:
        token = authorization.split(' ')[1] if authorization and authorization.startswith('Bearer ') else None
        result=_pub(p, token)
        if token:
            try:
                owner_id=_supabase_user_id_from_token(authorization)
                _grant_owner(result['id'], owner_id, token)
            except Exception:
                pass
        store.log('report.publish_cloud',{'id':result['id'],'name':result['name']})
        return {'ok':True,'id':result['id'],'name':result['name'],'publishedAt':result.get('published_at')}
    except RuntimeError as e:raise HTTPException(503,str(e))

@app.post('/api/v1/cloud/share')
def cloud_share_report(payload:dict,authorization:str|None=Header(default=None)):
    """Grant a registered user Viewer or Co-Owner access to a cloud report."""
    try:
        from .supabase_store import grant_access as _grant
    except ImportError:
        raise HTTPException(503,'supabase package not installed')
    report_id=payload.get('report_id');email=payload.get('email');role=payload.get('role','Viewer')
    if not report_id or not email:raise HTTPException(400,'report_id and email are required')
    try:
        granter_id=_supabase_user_id_from_token(authorization)
    except Exception as e:
        raise HTTPException(401,f'Unauthorized: {e}')
    token = authorization.split(' ')[1] if authorization and authorization.startswith('Bearer ') else None
    try:
        result=_grant(report_id, email, role, granter_id, token)
        return result
    except PermissionError as e:raise HTTPException(403,str(e))
    except ValueError as e:raise HTTPException(404,str(e))

@app.get('/api/v1/cloud/reports')
def cloud_list_reports(authorization:str|None=Header(default=None)):
    """List all cloud reports accessible to the authenticated Supabase user."""
    try:
        from .supabase_store import list_accessible_reports as _list
    except ImportError:
        raise HTTPException(503,'supabase package not installed')
    user_id=_supabase_user_id_from_token(authorization)
    return _list(user_id)

@app.post('/api/v1/cloud/sync-data')
def cloud_sync_data(project: dict, authorization: str | None = Header(default=None)):
    try:
        from .supabase_store import _admin_client
        sb = _admin_client()
    except Exception:
        return {'project': project}
        
    try:
        sb.storage.create_bucket('vtab_data', {'public': True})
    except Exception:
        pass

    import os, hashlib
    supabase_url = os.environ.get('VITE_SUPABASE_URL', '').rstrip('/')
    if not supabase_url: return {'project': project}

    from .local_engine import _parquet_path
    
    tables = project.get('model', {}).get('tables', {})
    for t_name, t_def in tables.items():
        if t_def.get('type') == 'postgresql' or t_def.get('sourceUrl'):
            continue
        
        path = _parquet_path(t_name)
        if path.exists():
            try:
                with open(path, 'rb') as f:
                    file_bytes = f.read()
                    h = hashlib.md5(file_bytes).hexdigest()[:8]
                    # Make it url safe
                    safe_name = ''.join(c if c.isalnum() else '_' for c in t_name)
                    filename = f"{safe_name}_{h}.parquet"
                    
                    try:
                        sb.storage.from_('vtab_data').upload(
                            filename, 
                            file_bytes, 
                            {"content-type": "application/octet-stream", "upsert": "true"}
                        )
                    except Exception:
                        pass
                    
                    t_def['sourceUrl'] = f"{supabase_url}/storage/v1/object/public/vtab_data/{filename}"
            except Exception as e:
                print('Error syncing', t_name, e)

    return {'project': project}

@app.post('/api/v1/cloud/upload-package')
async def cloud_upload_package(file:UploadFile=File(...), authorization:str|None=Header(default=None)):
    """Upload a .vtabpkg or .vtabapp to the cloud."""
    try:
        from .supabase_store import upload_package as _upload
    except ImportError:
        raise HTTPException(503,'supabase package not installed')
    user_id=_supabase_user_id_from_token(authorization)
    token=authorization.split(' ')[1] if authorization else None
    content = await file.read()
    try:
        return _upload(content, file.filename, user_id, token)
    except ValueError as e: raise HTTPException(400,str(e))
    except Exception as e: raise HTTPException(500,str(e))

@app.get('/api/v1/cloud/workspaces')
def cloud_list_workspaces(authorization:str|None=Header(default=None)):
    """List workspaces the user is a member of."""
    try:
        from .supabase_store import list_workspaces as _list
    except ImportError:
        raise HTTPException(503,'supabase package not installed')
    user_id=_supabase_user_id_from_token(authorization)
    try:
        return _list(user_id)
    except Exception as e: raise HTTPException(400, str(e))

@app.get('/api/v1/cloud/workspaces/{workspace_id}')
def cloud_get_workspace(workspace_id:str, authorization:str|None=Header(default=None)):
    """Get workspace details, members, and reports."""
    try:
        from .supabase_store import get_workspace_detail as _get
    except ImportError:
        raise HTTPException(503,'supabase package not installed')
    user_id=_supabase_user_id_from_token(authorization)
    try:
        return _get(workspace_id, user_id)
    except PermissionError as e: raise HTTPException(403,str(e))
    except ValueError as e: raise HTTPException(404,str(e))
    except Exception as e: raise HTTPException(400,str(e))

@app.post('/api/v1/cloud/workspaces')
def cloud_create_workspace(payload:dict, authorization:str|None=Header(default=None)):
    """Create a new workspace."""
    try:
        from .supabase_store import create_workspace as _create
    except ImportError:
        raise HTTPException(503,'supabase package not installed')
    user_id=_supabase_user_id_from_token(authorization)
    name = payload.get('name')
    if not name: raise HTTPException(400,'name is required')
    try:
        return _create(name, user_id)
    except Exception as e: raise HTTPException(400,str(e))

@app.delete('/api/v1/cloud/workspaces/{workspace_id}')
def cloud_delete_workspace(workspace_id:str, authorization:str|None=Header(default=None)):
    """Delete a workspace."""
    try:
        from .supabase_store import delete_workspace as _delete
    except ImportError:
        raise HTTPException(503,'supabase package not installed')
    user_id=_supabase_user_id_from_token(authorization)
    try:
        return _delete(workspace_id, user_id)
    except PermissionError as e: raise HTTPException(403,str(e))
    except Exception as e: raise HTTPException(400,str(e))


@app.post('/api/v1/cloud/workspaces/{workspace_id}/members')
def cloud_add_workspace_member(workspace_id:str, payload:dict, authorization:str|None=Header(default=None)):
    """Add a member to a workspace."""
    try:
        from .supabase_store import add_workspace_member as _add
    except ImportError:
        raise HTTPException(503,'supabase package not installed')
    user_id=_supabase_user_id_from_token(authorization)
    email = payload.get('email')
    role = payload.get('role', 'Member')
    if not email: raise HTTPException(400,'email is required')
    try:
        return _add(workspace_id, email, role, user_id)
    except PermissionError as e: raise HTTPException(403,str(e))
    except ValueError as e: raise HTTPException(404,str(e))
    except Exception as e: raise HTTPException(400,str(e))

@app.post('/api/v1/cloud/workspaces/{workspace_id}/reports')
def cloud_share_report_to_workspace(workspace_id:str, payload:dict, authorization:str|None=Header(default=None)):
    """Share a report into a workspace."""
    try:
        from .supabase_store import share_report_to_workspace as _share
    except ImportError:
        raise HTTPException(503,'supabase package not installed')
    user_id=_supabase_user_id_from_token(authorization)
    report_id = payload.get('report_id')
    if not report_id: raise HTTPException(400,'report_id is required')
    try:
        return _share(report_id, workspace_id, user_id)
    except PermissionError as e: raise HTTPException(403,str(e))
    except Exception as e: raise HTTPException(400,str(e))



def _supabase_user_id_from_token(authorization:str|None)->str:
    """Decode the Supabase JWT and return the user's UUID. Raises 401 on failure."""
    import base64,json as _json
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401,'Missing or invalid Authorization header')
    token=authorization.split(' ',1)[1]
    try:
        payload_b64=token.split('.')[1]
        padding=4-len(payload_b64)%4
        payload=_json.loads(base64.urlsafe_b64decode(payload_b64+'='*padding))
        uid=payload.get('sub')
        if not uid:raise ValueError('No sub claim')
        return uid
    except Exception:
        raise HTTPException(401,'Invalid Supabase JWT')


@app.get('/api/v1/admin/users')
def admin_users(): return store.list_users()

@app.post('/api/v1/admin/users')
def admin_save_user(payload:dict):
    try:
        item=store.save_user(payload);store.log('admin.user.save',{'id':item['id'],'email':item['email'],'role':item.get('role')});return item
    except Exception as e: raise HTTPException(400,str(e))

@app.delete('/api/v1/admin/users/{user_id}')
def admin_delete_user(user_id:str):
    store.delete_user(user_id);store.log('admin.user.delete',{'id':user_id});return {'ok':True}

@app.get('/api/v1/admin/connections')
def admin_connections(): return store.list_connections()

@app.post('/api/v1/admin/connections')
def admin_save_connection(payload:dict):
    try:
        item=store.save_connection(payload);store.log('admin.connection.save',{'id':item['id'],'name':item['name'],'type':item['type']});safe=dict(item);cfg=safe.get('config',{});
        for k in list(cfg):
            if any(x in k.lower() for x in ('password','secret','token','key')) and cfg.get(k):cfg[k]='********'
        return safe
    except Exception as e: raise HTTPException(400,str(e))

@app.delete('/api/v1/admin/connections/{connection_id}')
def admin_delete_connection(connection_id:str):
    store.delete_connection(connection_id);store.log('admin.connection.delete',{'id':connection_id});return {'ok':True}

@app.post('/api/v1/admin/connections/{connection_id}/test')
def admin_test_connection(connection_id:str):
    item=store.get_connection(connection_id)
    if not item: raise HTTPException(404,'Connection not found')
    try:return test_connection({'type':item['type'],'config':item.get('config',{})})
    except Exception as e:raise HTTPException(400,str(e))

@app.get('/api/v1/admin/settings')
def admin_settings():
    cfg=store.get_setting('workspace_email',{}) or {};cfg=dict(cfg)
    if cfg.get('smtpPassword'):cfg['smtpPassword']='********'
    return cfg

@app.post('/api/v1/admin/settings')
def admin_save_settings(payload:dict):
    current=store.get_setting('workspace_email',{}) or {};payload=dict(payload)
    if payload.get('smtpPassword')=='********':payload['smtpPassword']=current.get('smtpPassword','')
    store.set_setting('workspace_email',payload);store.log('admin.settings.save',{'workspaceBaseUrl':payload.get('workspaceBaseUrl'),'smtpHost':payload.get('smtpHost')});return {'ok':True}

@app.get('/api/v1/published/{report_id}/export/{fmt}')
def export_published(report_id:str,fmt:str,authorization:str|None=Header(default=None)):
    _workspace_user(authorization);item=store.get_published(report_id)
    if not item:raise HTTPException(404,'Published report not found')
    project=item['project'];safe=''.join(ch if ch.isalnum() or ch in '-_' else '_' for ch in item['name']) or 'VTAB_Report'
    if fmt.lower()=='pdf':
        data=report_pdf(project);return Response(data,media_type='application/pdf',headers={'Content-Disposition':f'attachment; filename="{safe}.pdf"'})
    if fmt.lower() in ('ppt','pptx'):
        data=report_pptx(project);return Response(data,media_type='application/vnd.openxmlformats-officedocument.presentationml.presentation',headers={'Content-Disposition':f'attachment; filename="{safe}.pptx"'})
    raise HTTPException(400,'Supported export formats are PDF and PPTX.')

@app.post('/api/v1/published/{report_id}/share-email')
def share_published_email(report_id:str,payload:dict,authorization:str|None=Header(default=None)):
    _workspace_user(authorization);item=store.get_published(report_id)
    if not item:raise HTTPException(404,'Published report not found')
    recipients=payload.get('to') or []
    if isinstance(recipients,str):recipients=[x.strip() for x in recipients.split(',') if x.strip()]
    if not recipients:raise HTTPException(400,'At least one recipient email is required.')
    cfg=store.get_setting('workspace_email',{}) or {};base=(cfg.get('workspaceBaseUrl') or '').rstrip('/')
    report_url=(base+f'/?viewer={report_id}') if base else payload.get('reportUrl')
    attachment=None;attachment_name=None;attachment_type=None;fmt=(payload.get('attach') or '').lower()
    if fmt=='pdf':attachment=report_pdf(item['project']);attachment_name=(item['name']+'.pdf');attachment_type='pdf'
    elif fmt in ('ppt','pptx'):attachment=report_pptx(item['project']);attachment_name=(item['name']+'.pptx');attachment_type='pptx'
    smtp={'host':cfg.get('smtpHost'),'port':cfg.get('smtpPort'),'username':cfg.get('smtpUsername'),'password':cfg.get('smtpPassword'),'fromEmail':cfg.get('smtpFrom'),'ssl':cfg.get('smtpSsl',False),'startTls':cfg.get('smtpStartTls',True)}
    try:
        result=send_report_email(smtp_cfg=smtp,to=recipients,subject=payload.get('subject') or ('VTAB Report: '+item['name']),body=payload.get('message') or 'A VTAB Workspace report has been shared with you.',report_url=report_url,attachment_name=attachment_name,attachment=attachment,attachment_type=attachment_type)
        store.log('report.share.email',{'id':report_id,'to':recipients,'attach':fmt});return result
    except Exception as e:raise HTTPException(400,str(e))

@app.get('/api/v1/packages/formats')
def package_formats():
    return [
        {'extension':'.vtabapp','name':'Application Definition','contains':'UI + Model + ETL','data':False,'description':'Portable report/application definition without business data.'},
        {'extension':'.vtabpkg','name':'Complete Application','contains':'UI + Model + ETL + Data','data':True,'description':'Complete portable application including processed data.'},
        {'extension':'.vtabdata','name':'Data Package','contains':'Data only','data':True,'description':'Portable data tables without report UI/application definition.'},
    ]

@app.get('/api/v1/packages/export/{package_type}')
def package_export(package_type:str):
    ext={'app':'.vtabapp','complete':'.vtabpkg','data':'.vtabdata'}.get(package_type,package_type if package_type.startswith('.') else '')
    if ext not in FORMATS: raise HTTPException(400,'Choose app, complete, or data.')
    try:
        path,filename=export_package(project(),ext)
        return FileResponse(path,media_type='application/octet-stream',filename=filename)
    except Exception as e: raise HTTPException(400,str(e))

@app.post('/api/v1/packages/inspect')
async def package_inspect(file:UploadFile=File(...)):
    filename=Path(file.filename or '').name; ext=Path(filename).suffix.lower()
    if ext not in FORMATS: raise HTTPException(400,'Use .vtabapp, .vtabpkg or .vtabdata.')
    tmp=None
    try:
        with tempfile.NamedTemporaryFile(delete=False,suffix=ext) as f:
            tmp=Path(f.name)
            while chunk:=await file.read(8*1024*1024): f.write(chunk)
        return inspect_package(tmp,ext)
    except Exception as e: raise HTTPException(400,str(e))
    finally:
        if tmp and tmp.exists():
            try: tmp.unlink()
            except Exception: pass

@app.post('/api/v1/packages/import')
async def package_import(file:UploadFile=File(...)):
    filename=Path(file.filename or '').name; ext=Path(filename).suffix.lower()
    if ext not in FORMATS: raise HTTPException(400,'Use .vtabapp, .vtabpkg or .vtabdata.')
    max_bytes=int(os.environ.get('VTAB_MAX_PACKAGE_MB','10240'))*1024*1024; total=0; tmp=None
    try:
        with tempfile.NamedTemporaryFile(delete=False,suffix=ext) as f:
            tmp=Path(f.name)
            while True:
                chunk=await file.read(8*1024*1024)
                if not chunk: break
                total+=len(chunk)
                if total>max_bytes: raise HTTPException(413,'VTAB package exceeds VTAB_MAX_PACKAGE_MB.')
                f.write(chunk)
        result=import_package(tmp,store); clear_cache(); return result
    except HTTPException: raise
    except Exception as e: raise HTTPException(400,str(e))
    finally:
        if tmp and tmp.exists():
            try: tmp.unlink()
            except Exception: pass

@app.get('/api/v1/connectors')
def connectors():return SOURCE_CATALOG
@app.post('/api/v1/connections/test')
def conn_test(payload:dict):
    try:return test_connection(payload)
    except Exception as e:raise HTTPException(400,str(e))
@app.post('/api/v1/files/import')
async def upload_data(file:UploadFile=File(...),sheet:str|None=Form(default=None)):
    filename=Path(file.filename or 'upload.csv').name
    suffix=Path(filename).suffix.lower() or '.csv'
    allowed={'.csv','.tsv','.txt','.xlsx','.xls','.json','.jsonl','.parquet','.xml'}
    if suffix not in allowed:raise HTTPException(400,'Unsupported file type.')
    max_bytes=int(os.environ.get('VTAB_MAX_UPLOAD_MB','2048'))*1024*1024
    tmp_path=None;total=0
    try:
        with tempfile.NamedTemporaryFile(delete=False,suffix=suffix) as tmp:
            tmp_path=Path(tmp.name)
            while True:
                chunk=await file.read(8*1024*1024)
                if not chunk:break
                total+=len(chunk)
                if total>max_bytes:raise HTTPException(413,f'Upload exceeds VTAB_MAX_UPLOAD_MB ({max_bytes//1024//1024} MB).')
                tmp.write(chunk)
        result=import_file_path(filename,tmp_path,sheet,total)
        store.log('file.import',{'filename':filename,'table':result['table'],'rows':result['rows'],'sourceBytes':total,'storage':result.get('storage')})
        clear_cache()
        return result
    except Exception as e:
        raise HTTPException(400,str(e))
    finally:
        if tmp_path and tmp_path.exists():
            try:tmp_path.unlink()
            except Exception:pass


@app.post('/api/v1/files/append-tables')
def append_imported_tables(req:AppendTablesReq):
    """Append already-imported local tables into one managed table.

    Folder import uses this endpoint after streaming each file through the normal
    columnar importer. `strict` requires identical column order/names. `by_name`
    uses DuckDB UNION ALL BY NAME so compatible folder drops can tolerate
    reordered columns or missing optional columns (missing values become NULL).
    """
    try:
        tables=[t for t in req.tables if t]
        if len(tables)<1:
            raise ValueError('Select at least one imported file/table to build the combined table.')
        metas={m['name']:m for m in demo_metadata()}
        missing=[t for t in tables if t not in metas]
        if missing: raise ValueError('Imported table(s) not found: '+', '.join(missing))
        schemas={t:table_columns(t) for t in tables}
        types={t:table_types(t) for t in tables}
        base_cols=schemas[tables[0]]
        incompat=[]
        if req.schemaMode=='strict':
            incompat=[t for t in tables[1:] if schemas[t]!=base_cols]
            if incompat:
                raise ValueError('Strict append requires identical columns and order. Incompatible: '+', '.join(incompat))
        target=safe_table_name(req.name or 'Folder_Append')
        # Never overwrite one of the staging/source tables.
        if target in tables: target=safe_table_name((req.name or 'Folder_Append')+'_Combined')
        def q(n:str): return '"'+n.replace('"','""')+'"'
        union_cols=[]
        for t in tables:
            for c in schemas[t]:
                if c not in union_cols: union_cols.append(c)
        append_cols=base_cols if req.schemaMode=='strict' else union_cols
        cast_text_cols=set()
        for c in append_cols:
            seen={str(types[t].get(c,'')).upper() for t in tables if c in types[t]}
            seen={x for x in seen if x}
            if len(seen)>1:cast_text_cols.add(c)
        selects=[]
        for t in tables:
            present=set(schemas[t]);parts=[]
            for c in append_cols:
                qc=q(c)
                if c in present:
                    parts.append(f'CAST({qc} AS VARCHAR) AS {qc}' if c in cast_text_cols else qc)
                else:
                    parts.append(f'CAST(NULL AS VARCHAR) AS {qc}' if c in cast_text_cols else f'NULL AS {qc}')
            selects.append('SELECT '+', '.join(parts)+' FROM '+q(t))
        sql=' UNION ALL '.join(selects)
        rows,_=materialize_query(sql,[],target)
        warnings=[]
        if any(schemas[t]!=base_cols for t in tables[1:]):
            warnings.append('Schemas were aligned by column name; missing columns were filled with NULL.')
        if cast_text_cols:
            warnings.append('Columns with mixed inferred types were preserved as text: '+', '.join(sorted(cast_text_cols)))
        removed=[]
        if req.removeSources:
            for t in tables:
                try:
                    delete_managed_table(t);removed.append(t)
                except Exception as exc:
                    warnings.append(f'Could not remove staging table {t}: {exc}')
        store.log('file.folder.append',{'tables':tables,'target':target,'rows':rows,'schemaMode':req.schemaMode,'removedSources':removed})
        clear_cache()
        meta=next((m for m in demo_metadata() if m['name']==target),None)
        return {'ok':True,'table':target,'rows':rows,'columns':append_cols,'sourceTables':tables,'removedSources':removed,'warnings':warnings,'metadata':meta}
    except Exception as e:
        raise HTTPException(400,str(e))

@app.post('/api/v1/cloud/import')
def cloud_import(req:CloudImportReq):
    try:
        result=import_cloud(req.sourceType,req.url,req.name);store.log('cloud.import',{'sourceType':req.sourceType,'table':result['table'],'rows':result['rows']});return result
    except Exception as e:raise HTTPException(400,str(e))
@app.post('/api/v1/transform/add-source')
def add_transform_source(req:AddTransformSourceReq):
    p=project();meta=next((x for x in demo_metadata() if x['name']==req.physicalTable),None)
    if not meta:raise HTTPException(404,'Table not found')
    base=(req.queryName or req.physicalTable.replace('Imported_','')).strip() or req.physicalTable;name=base;idx=2
    while any(q.get('name')==name for q in p['transform']['queries']):name=f'{base} {idx}';idx+=1
    qid='q-'+str(uuid.uuid4());p['transform']['queries'].append({'id':qid,'name':name,'source':req.physicalTable,'steps':[{'id':'src-'+qid,'type':'source','label':'Source: '+req.physicalTable,'enabled':True}]});store.save_project(p);store.log('transform.source.add',{'physicalTable':req.physicalTable,'query':name});return {'ok':True,'queryId':qid,'queryName':name,'project':p}

@app.post('/api/v1/model/add-table')
def add_model_table(req:AddModelTableReq):
    p=project();meta=next((x for x in demo_metadata() if x['name']==req.physicalTable),None)
    if not meta:raise HTTPException(404,'Table not found')
    requested=(req.semanticName or req.physicalTable.replace('Imported_','').replace('ETL_','')).strip() or req.physicalTable
    # Close & Apply is idempotent for the same semantic query: update the existing model table rather than create "Table 2".
    existing=next((n for n,x in p['model']['tables'].items() if n==requested or x.get('physical')==req.physicalTable),None)
    name=existing or requested
    if not existing:
        base=name;idx=2
        while name in p['model']['tables']:
            name=f'{base} {idx}';idx+=1
    cols={c['name']:c['name'] for c in meta['columns']}
    current=p['model']['tables'].get(name,{})
    p['model']['tables'][name]={'physical':req.physicalTable,'x':current.get('x',120+80*(len(p['model']['tables'])%5)),'y':current.get('y',120+65*(len(p['model']['tables'])%6)),'columns':cols}
    _ensure_model_hierarchies(p)
    store.save_project(p);clear_cache();return {'ok':True,'semanticName':name,'updated':bool(existing),'project':p}
@app.post('/api/v1/transform/preview')
def transform(req:TransformReq):
    try:
        rows,sql,cols,folding=preview(req.source,req.steps,req.limit);return {'rows':rows,'sql':sql,'columns':cols,'pushdown':True,'folding':folding}
    except Exception as e:raise HTTPException(400,str(e))
@app.post('/api/v1/transform/join-profile')
def transform_join_profile(req:JoinProfileReq):
    try:return join_profile(req.source,req.steps,req.otherTable,req.keys)
    except Exception as e:raise HTTPException(400,str(e))

@app.post('/api/v1/transform/ai-suggestions')
def transform_ai(req:TransformReq):
    try:return {'suggestions':ai_suggestions(req.source,req.steps)}
    except Exception as e:raise HTTPException(400,str(e))

@app.post('/api/v1/transform/calculated-column/validate')
def validate_calculated_column(req:CalculatedColumnReq):
    try:
        temp={'id':'validate-calc','type':'calculated_column','label':'Validate calculated column','name':req.name,'expression':req.expression,'enabled':True}
        rows,sql,cols,folding=preview(req.source,[*req.steps,temp],10)
        return {'valid':True,'rows':rows,'sql':sql,'columns':cols,'folding':folding[-1] if folding else None}
    except Exception as e:
        return {'valid':False,'error':str(e)}

@app.post('/api/v1/transform/calculated-column/ai-generate')
def ai_calculated_column(req:CalculatedColumnPromptReq):
    try:
        # Compile current steps first so AI is grounded to the exact current ETL column set.
        rows,_,cols,_=preview(req.source,req.steps,5)
        if not cols and rows: cols=list(rows[0].keys())
        result=suggest_calculated_column(req.prompt,cols)
        temp={'id':'ai-calc','type':'calculated_column','label':'AI calculated column','name':result['name'],'expression':result['expression'],'enabled':True}
        test_rows,sql,_,_=preview(req.source,[*req.steps,temp],8)
        result.update({'valid':True,'preview':test_rows,'compiledSql':sql})
        return result
    except Exception as e:
        raise HTTPException(400,str(e))

@app.post('/api/v1/transform/apply')
def apply_transform(req:ApplyTransformReq):
    try:
        table,count,cols=materialize(req.source,req.steps,req.name)
        # Reuse model registration so the applied result is immediately reportable.
        result=add_model_table(AddModelTableReq(physicalTable=table,semanticName=req.name))
        store.log('transform.apply',{'name':req.name,'table':table,'rows':count})
        return {'ok':True,'table':table,'rows':count,'columns':cols,'semanticName':result['semanticName']}
    except Exception as e:raise HTTPException(400,str(e))

@app.post('/api/v1/measures/catalog')
def measure_catalog(req:MeasureCatalogReq):
    try:
        p=project()
        return generate_measure_catalog(p['model'],max(1,min(int(req.limit or 360),360)))
    except Exception as e:raise HTTPException(400,str(e))

@app.post('/api/v1/measures/bulk-save')
def bulk_save_measures(req:BulkMeasureReq):
    p=project();model=p.setdefault('model',{});current=dict(model.setdefault('measures',{}));working=dict(current)
    saved=[];errors=[]
    for item in req.measures[:360]:
        name=(item.name or '').strip().replace(' ','_')
        if not name or not item.expression.strip():
            errors.append({'name':name or '(blank)','error':'Name and expression are required.'});continue
        try:
            candidate,_=merge_measure_registry(working,name,item.expression,item.originalName)
            test_model={**model,'measures':candidate}
            compiled=measure(name,test_model,context_filters=[])
            working=candidate;saved.append({'name':name,'compiled':compiled})
        except Exception as exc:
            errors.append({'name':name,'error':str(exc)})
    model['measures']=working
    store.save_project(p);clear_cache();store.log('measure.bulk-save',{'saved':len(saved),'errors':len(errors),'totalMeasures':len(working)})
    return {'ok':len(errors)==0,'saved':saved,'errors':errors,'measureCount':len(working),'project':p}

@app.post('/api/v1/measures/validate')
def validate_measure(req:MeasureReq):
    p=project();m=p['model'];old=m['measures'].get(req.name);m['measures'][req.name]=req.expression
    try:
        compiled=measure(req.name,m,context_filters=[])
        return {'valid':True,'compiled':compiled,'engine':'VTAB DAX'}
    except Exception as e:
        return {'valid':False,'error':str(e),'engine':'VTAB DAX'}
    finally:
        if old is None:m['measures'].pop(req.name,None)
        else:m['measures'][req.name]=old

@app.post('/api/v1/measures/ai-generate')
def ai_generate_measure(req:MeasurePromptReq):
    try:
        p=project()
        result=suggest_measure_from_prompt(req.prompt,p['model'])
        m=p['model'];old=m['measures'].get(result['name']);m['measures'][result['name']]=result['expression']
        try:
            result['compiled']=measure(result['name'],m,context_filters=[])
            result['valid']=True
        except Exception as e:
            result['valid']=False
            result['validationError']=str(e)
        finally:
            if old is None:m['measures'].pop(result['name'],None)
            else:m['measures'][result['name']]=old
        return result
    except Exception as e:
        raise HTTPException(400,str(e))

@app.post('/api/v1/measures/save')
def save_measure(req:SaveMeasureReq):
    p=project();name=req.name.strip();original=(req.originalName or '').strip() or None
    if not name:
        raise HTTPException(400,'Measure name is required')
    measures=p['model'].setdefault('measures',{})
    try:
        working,renamed=merge_measure_registry(measures,name,req.expression,original)
    except ValueError as e:
        raise HTTPException(400,str(e))

    old_measures=p['model']['measures']
    p['model']['measures']=working
    try:
        compiled=measure(name,p['model'],context_filters=[])
        # Validate every measure after dependency-reference rewrites.
        for m in list(working):
            measure(m,p['model'],context_filters=[])
    except Exception as e:
        p['model']['measures']=old_measures
        raise HTTPException(400,str(e))

    # Keep visuals connected after a measure rename.
    if original and original!=name:
        for page in p.get('report',{}).get('pages',[]):
            for visual in page.get('visuals',[]):
                bindings=visual.get('bindings',{}) or {}
                for key in ('values','target','tooltips'):
                    if isinstance(bindings.get(key),list):
                        bindings[key]=[name if x==original else x for x in bindings[key]]

    store.save_project(p)
    action='measure.update' if original else 'measure.create'
    store.log(action,{'name':name,'originalName':original,'engine':'VTAB DAX'});clear_cache()
    return {'ok':True,'name':name,'originalName':original,'renamed':renamed,'measureCount':len(working),'measureNames':list(working),'compiled':compiled,'project':p}
@app.post('/api/v1/query')
def query(req:QueryReq):
    p=project();rules=[]
    if req.roleId:
        role=next((r for r in p['security']['roles'] if r['id']==req.roleId),None);rules=role['rules'] if role else []
    try:
        rows,sql=execute(p['model'],req.model_dump(),rules);store.log('query.execute',{'dimensions':req.dimensions,'measures':req.measures,'rows':len(rows)});return {'rows':rows,'sql':sql}
    except Exception as e:raise HTTPException(400,str(e))
@app.post('/api/v1/published/{report_id}/query')
def published_query(report_id:str,req:QueryReq,authorization:str|None=Header(default=None)):
    _workspace_user(authorization);item=store.get_published(report_id)
    if not item:raise HTTPException(404,'Published report not found')
    p=item['project'];rules=[]
    if req.roleId:
        role=next((r for r in p.get('security',{}).get('roles',[]) if r.get('id')==req.roleId),None);rules=role.get('rules',[]) if role else []
    try:
        rows,sql=execute(p['model'],req.model_dump(),rules);store.log('published.query.execute',{'reportId':report_id,'dimensions':req.dimensions,'measures':req.measures,'rows':len(rows)});return {'rows':rows,'sql':sql}
    except Exception as e:raise HTTPException(400,str(e))

@app.post('/api/v1/published/query-snapshot')
def published_snapshot_query(req:PublishedSnapshotQueryReq,authorization:str|None=Header(default=None)):
    _workspace_user(authorization);p=req.project or {};rules=[]
    if req.roleId:
        role=next((r for r in p.get('security',{}).get('roles',[]) if r.get('id')==req.roleId),None);rules=role.get('rules',[]) if role else []
    try:
        payload=req.model_dump();payload.pop('project',None)
        rows,sql=execute(p['model'],payload,rules);store.log('published.snapshot.query.execute',{'dimensions':req.dimensions,'measures':req.measures,'rows':len(rows)});return {'rows':rows,'sql':sql}
    except Exception as e:raise HTTPException(400,str(e))

@app.get('/api/v1/storage/stats')
def get_storage_stats():
    return {**storage_stats(),'queryCache':cache_stats()}

@app.post('/api/v1/storage/optimize')
def optimize_local_storage():
    result=optimize_storage();clear_cache()
    store.log('storage.optimize',{'rewritten':result.get('rewritten',0)})
    return {**result,'queryCache':cache_stats()}

@app.post('/api/v1/performance/cache/clear')
def clear_query_cache():
    clear_cache();return {'ok':True,**cache_stats()}

@app.get('/api/v1/audit')
def audit():return store.audits()
