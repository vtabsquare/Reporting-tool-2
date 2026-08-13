import { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase";
import PublishedViewer from "./PublishedViewer";
import ShareDialog from "./ShareDialog";

type Report = { id: string; name: string; published_at: string; updated_at?: string; pages: number; role: string; project?: any };
type Workspace = { id: string; name: string; created_at: string; role: string; member_count: number; report_count: number };
type WorkspaceDetail = Workspace & { members: any[]; reports: any[] };

const workspaceTarget=()=>{const p=new URLSearchParams(location.search);return{reportId:p.get('report')||p.get('viewer')||'',share:p.get('share')==='1'}};

export default function CloudWorkspace({ session }: { session: any }) {
  const [activeTab, setActiveTab] = useState<'reports'|'workspaces'>('reports');
  const [reports, setReports] = useState<Report[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [targetDenied, setTargetDenied] = useState("");
  const [viewing, setViewing] = useState<Report | null>(null);
  const [sharing, setSharing] = useState<Report | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const fetchReports = async () => {
    const { data: grants, error: gErr } = await supabase.from("report_access_grants").select("report_id, role").eq("user_id", session?.user?.id);
    if (gErr) throw gErr;
    if (!grants || grants.length === 0) return [];
    const ids = grants.map((g: any) => g.report_id);
    const { data: rows, error: rErr } = await supabase.from("published_reports").select("id, name, published_at, project_json").in("id", ids);
    if (rErr) throw rErr;
    const roleMap: Record<string, string> = {};
    grants.forEach((g: any) => { roleMap[g.report_id] = g.role; });
    return (rows || []).map((r: any) => ({
      ...r, role: roleMap[r.id] || "Viewer",
      project: (() => { try { return JSON.parse(r.project_json || "{}"); } catch { return {}; } })(),
      pages: (() => { try { return JSON.parse(r.project_json)?.report?.pages?.length || 1; } catch { return 1; } })()
    }));
  };

  const loadData = async () => {
    try {
      setLoading(true); setErr(""); setTargetDenied("");
      const r = await fetchReports();
      setReports(r);
      const res = await fetch('/api/v1/cloud/workspaces', { headers: { 'Authorization': `Bearer ${session?.access_token}` } });
      if (res.ok) setWorkspaces(await res.json());
      const target = workspaceTarget();
      if (target.reportId && !r.some((x:any) => x.id === target.reportId)) setTargetDenied("This report is not shared with the signed-in account.");
    } catch (e: any) { setErr(e.message || String(e)); } finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [session]);

  useEffect(() => {
    if (loading || viewing) return;
    const target = workspaceTarget();
    if (!target.reportId) return;

    // Try to find in already-loaded reports
    const report = reports.find(r => r.id === target.reportId);
    if (report) {
      setTargetDenied(""); setViewing(report);
      // Open share dialog for any user who can share (Owner, Co-Owner, Admin)
      const canShare = ['Owner','Co-Owner','Admin'].includes(report.role);
      if (target.share && canShare) setSharing(report);
      return;
    }

    // Not in grants yet — try loading directly from published_reports (for the publisher)
    if (!supabase) return;
    supabase.from('published_reports')
      .select('id, name, published_at, project_json')
      .eq('id', target.reportId)
      .eq('owner_id', session?.user?.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) {
          if (!loading) setTargetDenied('This report is not shared with the signed-in account.');
          return;
        }
        const r: Report = {
          id: data.id, name: data.name, published_at: data.published_at,
          role: 'Owner',
          pages: (() => { try { return JSON.parse(data.project_json)?.report?.pages?.length || 1; } catch { return 1; } })(),
          project: (() => { try { return JSON.parse(data.project_json || '{}'); } catch { return {}; } })()
        };
        setTargetDenied(''); setViewing(r);
        if (target.share) setSharing(r);
      });
  }, [loading, reports, viewing]);

  const signOut = async () => { await supabase?.auth.signOut(); location.reload(); };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData(); form.append('file', file);
    try {
      const res = await fetch('/api/v1/cloud/upload-package', {
        method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}` }, body: form
      });
      if (!res.ok) throw new Error((await res.json()).detail || 'Upload failed');
      alert('Package uploaded successfully!');
      loadData();
    } catch (err: any) { alert(err.message); } finally { setUploading(false); if (fileInput.current) fileInput.current.value = ''; }
  };

  const createWorkspace = async () => {
    const name = prompt("Enter workspace name:");
    if (!name) return;
    try {
      const res = await fetch('/api/v1/cloud/workspaces', {
        method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (res.ok) {
        await loadData();
        if (data.id) {
          loadWorkspace(data.id);
        }
      } else {
        alert(data.detail || 'Failed to create workspace');
      }
    } catch (err: any) {
      alert(err.message || String(err));
    }
  };

  const loadWorkspace = async (id: string) => {
    const res = await fetch(`/api/v1/cloud/workspaces/${id}`, { headers: { 'Authorization': `Bearer ${session?.access_token}` } });
    if (res.ok) setActiveWorkspace(await res.json()); else alert((await res.json()).detail || 'Failed to load workspace details');
  };

  const deleteWorkspace = async () => {
    if (!activeWorkspace) return;
    if (!confirm(`Are you sure you want to delete workspace "${activeWorkspace.name}"? This action cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/v1/cloud/workspaces/${activeWorkspace.id}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${session?.access_token}` }
      });
      if (res.ok) {
        alert('Workspace deleted successfully!');
        setActiveWorkspace(null);
        loadData();
      } else {
        const data = await res.json();
        alert(data.detail || 'Failed to delete workspace');
      }
    } catch (err: any) {
      alert(err.message || String(err));
    }
  };

  const addMember = async () => {
    const emails = prompt("Enter member's registered email addresses (comma separated):");
    if (!emails || !activeWorkspace) return;
    
    const emailList = emails.split(',').map(e => e.trim()).filter(e => e);
    if (!emailList.length) return;

    let addedCount = 0;
    for (const email of emailList) {
      try {
        const res = await fetch(`/api/v1/cloud/workspaces/${activeWorkspace.id}/members`, {
          method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role: 'Member' })
        });
        if (res.ok) { 
          addedCount++; 
        } else {
          const data = await res.json();
          alert(`Failed to add ${email}: ${data.detail || 'Unknown error'}`);
        }
      } catch (err: any) {
        alert(`Error adding ${email}: ${err.message || String(err)}`);
      }
    }
    
    if (addedCount > 0) {
      alert(`Successfully added ${addedCount} member(s)!`);
      loadWorkspace(activeWorkspace.id); 
      loadData();
    }
  };

  const shareToWorkspace = async () => {
    if (!reports.length) return alert("You don't have any reports to share yet. Upload or publish a report first.");
    const names = reports.map((r, i) => `${i+1}. ${r.name}`).join('\n');
    const idx = parseInt(prompt(`Enter the number of the report to share:\n${names}`) || "0") - 1;
    const report = reports[idx];
    if (!report || !activeWorkspace) return;
    try {
      const res = await fetch(`/api/v1/cloud/workspaces/${activeWorkspace.id}/reports`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_id: report.id })
      });
      const data = await res.json();
      if (res.ok) { alert(`Report "${report.name}" shared to workspace!`); loadWorkspace(activeWorkspace.id); loadData(); }
      else alert(data.detail || 'Failed to share report');
    } catch (err: any) {
      alert(err.message || String(err));
    }
  };

  if (viewing) {
    return (
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", background: "#0f172a", color: "#fff", fontSize: 13 }}>
          <button onClick={() => { setViewing(null); setSharing(null); history.replaceState(null, '', location.pathname + '?workspace=1'); }} style={{ background: "none", border: "1px solid #334155", borderRadius: 7, color: "#94a3b8", padding: "4px 10px", cursor: "pointer" }}>← Back</button>
          <b style={{ flex: 1 }}>{viewing.name}</b>
          {(viewing.role === "Co-Owner" || viewing.role === "Owner") && (
            <button onClick={() => setSharing(viewing)} style={{ background: "#2563eb", border: "none", borderRadius: 7, color: "#fff", padding: "6px 14px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
              Share
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflow: "hidden" }}>
          <PublishedViewer reportId={viewing.id} initialItem={{ id: viewing.id, name: viewing.name, published_at: viewing.published_at, updated_at: viewing.updated_at || viewing.published_at, project: viewing.project }} embedded cloudMode />
        </div>
        {sharing && <ShareDialog reportId={sharing.id} reportName={sharing.name} onClose={() => setSharing(null)} supabaseSession={session} />}
      </div>
    );
  }

  return (
    <div className="webPortalShell">
      <div className="webPortalBar">
        <div style={{display:'flex', alignItems:'center', gap:20}}>
          <div><b>VTAB Workspace</b><span>Cloud Reports Portal</span></div>
          <div style={{display:'flex', gap:10, marginLeft: 20}}>
             <button onClick={()=>{setActiveTab('reports'); setActiveWorkspace(null);}} style={{background:activeTab==='reports'?'#2563eb':'transparent', color:activeTab==='reports'?'#fff':'#94a3b8', border:'none', padding:'6px 12px', borderRadius:6, cursor:'pointer', fontWeight:600}}>My Reports</button>
             <button disabled={true} title="Coming soon" onClick={()=>setActiveTab('workspaces')} style={{background:activeTab==='workspaces'?'#2563eb':'transparent', color:activeTab==='workspaces'?'#fff':'#94a3b8', border:'none', padding:'6px 12px', borderRadius:6, cursor:'not-allowed', opacity: 0.5, fontWeight:600}}>Team Workspaces</button>
          </div>
        </div>
        <nav style={{display:'flex', gap:12, alignItems:'center'}}>
          {activeTab === 'reports' && (
             <button onClick={()=>fileInput.current?.click()} disabled={uploading} style={{background:'#10b981', color:'#fff', border:'none', padding:'6px 12px', borderRadius:6, cursor:'pointer', fontWeight:600, fontSize:12}}>
               {uploading ? 'Uploading...' : 'Upload Package'}
             </button>
          )}
          {activeTab === 'workspaces' && !activeWorkspace && (
             <button onClick={createWorkspace} style={{background:'#10b981', color:'#fff', border:'none', padding:'6px 12px', borderRadius:6, cursor:'pointer', fontWeight:600, fontSize:12}}>
               Create Workspace
             </button>
          )}
          <input type="file" ref={fileInput} hidden accept=".vtabapp,.vtabpkg,.vtabdata" onChange={handleUpload} />
          <button onClick={signOut} style={{ fontSize: 12 }}>Sign Out</button>
        </nav>
      </div>
      <main style={{padding:24, background:'#f8fafc', minHeight:'100vh'}}>
        {loading && <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading…</div>}
        {err && <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>{err}</div>}
        
        {!loading && activeTab === 'reports' && (
           <div>
             {reports.length === 0 ? (
               <div style={{ padding: 60, textAlign: "center", color: "#64748b" }}>
                 <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                 <b style={{ fontSize: 16, display: "block", marginBottom: 6 }}>No reports found</b>
                 <span style={{ fontSize: 13 }}>Upload a package or ask someone to share a report.</span>
               </div>
             ) : (
               <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                 {reports.map(r => (
                   <div key={r.id} onClick={() => { history.replaceState(null, '', `${location.pathname}?workspace=1&report=${encodeURIComponent(r.id)}`); setViewing(r); }} style={{
                     background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20, cursor: "pointer", transition: "box-shadow .15s", boxShadow: "0 2px 8px rgba(15,23,42,.05)"
                   }} onMouseOver={e => (e.currentTarget.style.boxShadow = "0 8px 24px rgba(15,23,42,.12)")} onMouseOut={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(15,23,42,.05)")}>
                     <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                       <div style={{ width: 40, height: 40, borderRadius: 10, background: "#dbeafe", display: "grid", placeItems: "center", fontSize: 20 }}>📊</div>
                       <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: r.role === "Co-Owner" ? "#ede9fe" : "#dbeafe", color: r.role === "Co-Owner" ? "#6d28d9" : "#1d4ed8" }}>{r.role}</span>
                     </div>
                     <b style={{ display: "block", fontSize: 15, color: "#0f172a", marginBottom: 4 }}>{r.name}</b>
                     <small style={{ color: "#64748b", fontSize: 12 }}>{r.pages} page{r.pages !== 1 ? "s" : ""} · {new Date(r.published_at).toLocaleDateString()}</small>
                   </div>
                 ))}
               </div>
             )}
           </div>
        )}

        {!loading && activeTab === 'workspaces' && !activeWorkspace && (
           <div>
             {workspaces.length === 0 ? (
               <div style={{ padding: 60, textAlign: "center", color: "#64748b" }}>
                 <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
                 <b style={{ fontSize: 16, display: "block", marginBottom: 6 }}>No workspaces</b>
                 <span style={{ fontSize: 13 }}>Click "Create Workspace" above to create your first team folder.</span>
               </div>
             ) : (
               <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                 {workspaces.map(w => (
                    <div key={w.id} onClick={() => loadWorkspace(w.id)} style={{
                      background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20, cursor: "pointer", transition: "box-shadow .15s", boxShadow: "0 2px 8px rgba(15,23,42,.05)", position: "relative"
                    }} onMouseOver={e => (e.currentTarget.style.boxShadow = "0 8px 24px rgba(15,23,42,.12)")} onMouseOut={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(15,23,42,.05)")}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#f3e8ff", display: "grid", placeItems: "center", fontSize: 20 }}>🏢</div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: w.role === "Admin" ? "#fce7f3" : "#f1f5f9", color: w.role === "Admin" ? "#be185d" : "#475569" }}>{w.role}</span>
                      </div>
                      <b style={{ display: "block", fontSize: 16, color: "#0f172a", marginBottom: 4 }}>{w.name}</b>
                      <small style={{ color: "#64748b", fontSize: 13, display:'block' }}>{w.member_count} member{w.member_count!==1?'s':''} · {w.report_count} report{w.report_count!==1?'s':''}</small>
                      
                      {w.role === 'Admin' && (
                        <button onClick={(e) => {
                          e.stopPropagation();
                          if (!confirm(`Are you sure you want to delete workspace "${w.name}"?`)) return;
                          fetch(`/api/v1/cloud/workspaces/${w.id}`, {
                            method: 'DELETE', headers: { 'Authorization': `Bearer ${session?.access_token}` }
                          }).then(async res => {
                            if (res.ok) { loadData(); }
                            else { const d = await res.json(); alert(d.detail || 'Delete failed'); }
                          });
                        }} style={{ position: "absolute", bottom: 20, right: 20, background: "#fef2f2", color: "#ef4444", border: "1px solid #fee2e2", padding: "4px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Delete</button>
                      )}
                    </div>
                  ))}
               </div>
             )}
           </div>
        )}

        {!loading && activeTab === 'workspaces' && activeWorkspace && (
           <div>
             <button onClick={() => setActiveWorkspace(null)} style={{background:'none', border:'none', color:'#3b82f6', cursor:'pointer', marginBottom:20, fontWeight:600}}>← Back to Workspaces</button>
             <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24}}>
               <h2 style={{margin:0, color:'#0f172a'}}>{activeWorkspace.name}</h2>
               {activeWorkspace.role === 'Admin' && (
                 <div style={{display:'flex', gap:10}}>
                   <button onClick={addMember} style={{background:'#fff', border:'1px solid #cbd5e1', padding:'6px 12px', borderRadius:6, cursor:'pointer', fontWeight:600}}>Add Member</button>
                   <button onClick={shareToWorkspace} style={{background:'#2563eb', color:'#fff', border:'none', padding:'6px 12px', borderRadius:6, cursor:'pointer', fontWeight:600}}>Share Report</button>
                   <button onClick={deleteWorkspace} style={{background:'#ef4444', color:'#fff', border:'none', padding:'6px 12px', borderRadius:6, cursor:'pointer', fontWeight:600}}>Delete Workspace</button>
                 </div>
               )}
             </div>

             <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:24}}>
               <div style={{background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:20}}>
                 <h3 style={{marginTop:0, marginBottom:16, fontSize:15, color:'#334155'}}>Members ({activeWorkspace.members.length})</h3>
                 <div style={{display:'flex', flexDirection:'column', gap:12}}>
                   {activeWorkspace.members.map(m => (
                     <div key={m.user_id} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f1f5f9'}}>
                       <span style={{fontSize:14}}>{m.email}</span>
                       <span style={{fontSize:12, background:'#f1f5f9', padding:'2px 8px', borderRadius:999}}>{m.role}</span>
                     </div>
                   ))}
                 </div>
               </div>

               <div style={{background:'#fff', border:'1px solid #e2e8f0', borderRadius:12, padding:20}}>
                 <h3 style={{marginTop:0, marginBottom:16, fontSize:15, color:'#334155'}}>Shared Reports ({activeWorkspace.reports.length})</h3>
                 <div style={{display:'flex', flexDirection:'column', gap:12}}>
                   {activeWorkspace.reports.map(r => (
                     <div key={r.id} style={{display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #f1f5f9'}}>
                       <span style={{fontSize:14, fontWeight:500}}>{r.name}</span>
                       <button onClick={() => {
                         const rpt = reports.find(x => x.id === r.id) || { ...r, role:'Viewer' };
                         history.replaceState(null, '', `${location.pathname}?workspace=1&report=${encodeURIComponent(r.id)}`);
                         setViewing(rpt as any);
                       }} style={{background:'none', border:'none', color:'#2563eb', cursor:'pointer', fontSize:13}}>View</button>
                     </div>
                   ))}
                   {activeWorkspace.reports.length === 0 && <span style={{fontSize:13, color:'#94a3b8'}}>No reports shared to this workspace yet.</span>}
                 </div>
               </div>
             </div>
           </div>
        )}
      </main>
    </div>
  );
}
