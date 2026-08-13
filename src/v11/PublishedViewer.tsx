import{useEffect,useMemo,useRef,useState}from'react';
import{createPortal}from'react-dom';
import{ChevronLeft,ChevronRight,RefreshCcw,Maximize2,Minimize2,Home,CalendarDays,ShieldCheck,MonitorUp,Expand,Scaling,Eraser,BarChart3,PieChart,Table2,LayoutGrid,Filter,TrendingUp,MousePointerClick,FileDown,Presentation,Mail}from'lucide-react';
import Chart from'../components/Chart';
import{api,apiDownload}from'../api';
import type{Visual,VisualFilter}from'../types';

// In WORKSPACE_ONLY (web portal) mode, chart queries go to the local desktop FastAPI
// that is always running on the publisher's machine. Report JSON is loaded from Supabase.
const WORKSPACE_ONLY=import.meta.env.VITE_APP_MODE==='WORKSPACE_ONLY';

async function fetchReportFromSupabase(reportId:string):Promise<any>{
  const{supabase}=await import('../supabase');
  if(!supabase)throw new Error('Supabase not configured');
  const{data,error}=await supabase
    .from('published_reports')
    .select('id,name,published_at,updated_at,project_json')
    .eq('id',reportId)
    .single();
  if(error)throw new Error(error.message);
  return{...data,project:JSON.parse(data.project_json)};
}

function queryVisual(reportId:string,v:Visual,roleId?:string|null,extraFilters:VisualFilter[]=[],project?:any){
 const measures=v.type==='slicer'?[]:[...(v.bindings.values||[]),...(v.bindings.target||[]),...(v.bindings.tooltips||[])];
 const dimensions=[...(v.bindings.axis||[]),...(v.bindings.legend||[])];
 const body=JSON.stringify({dimensions,measures,filters:[...(v.filters||[]),...extraFilters],sort:v.sort||[],limit:(v.type==='table'||v.type==='matrix')?500:500,roleId});
 if(project){
  return api<any>('/published/query-snapshot',{method:'POST',body:JSON.stringify({...JSON.parse(body),project})}).catch(e=>{throw new Error(`Cannot query visual data from the desktop semantic engine. Keep VTAB Reporting Studio running on this PC, then click Refresh. ${e?.message||e}`)});
 }
 return api<any>(`/published/${reportId}/query`,{method:'POST',body});
}
function visualTitleIcon(type:string){
 if(['pie','donut'].includes(type))return <PieChart size={15}/>;
 if(['table','matrix'].includes(type))return <Table2 size={15}/>;
 if(['kpi','card','multirowcard','progress','gauge'].includes(type))return <TrendingUp size={15}/>;
 if(type==='slicer')return <Filter size={15}/>;
 if(['bar','column','stackedbar','stackedcolumn','line','area','combo','scatter','bubble'].includes(type))return <BarChart3 size={15}/>;
 return <LayoutGrid size={15}/>;
}
function ViewerVisual({reportId,v,roleId,extraFilters,onCrossFilter,onAction,project}:{reportId:string,v:Visual,roleId?:string|null,extraFilters:VisualFilter[],onCrossFilter:(f:VisualFilter|null)=>void,onAction:(v:Visual)=>void,project?:any}){
 const[rows,setRows]=useState<any[]>([]),[err,setErr]=useState(''),[focus,setFocus]=useState(false);
 const load=()=>{if(v.type==='textbox'||v.type==='button'){setRows([]);setErr('');return Promise.resolve()}return queryVisual(reportId,v,roleId,extraFilters,project).then(r=>{setRows(r.rows||[]);setErr('')}).catch(e=>{setRows([]);setErr(e.message||String(e))})};
 useEffect(()=>{load()},[JSON.stringify(v.bindings),JSON.stringify(v.filters),JSON.stringify(v.sort),JSON.stringify(extraFilters),roleId,project?.id]);
 const f:any=v.format||{};const bg=f.background||'#fff';const dark=/^#0|^#1/.test(bg.toLowerCase());const accent=f.accent||({kpi:'#2563eb',card:'#16a34a',bar:'#2563eb',column:'#0ea5e9',line:'#16a34a',area:'#10b981',pie:'#f59e0b',donut:'#8b5cf6',gauge:'#16a34a',table:'#2563eb',matrix:'#4f46e5',slicer:'#e11d48'} as any)[v.type]||'#2563eb';
 const content=v.type==='textbox'?<div className="viewerTextBox" style={{fontSize:f.fontSize||18,color:f.labelColor||'#111827'}}>{v.text||''}</div>:v.type==='button'?<div className="viewerActionButtonWrap"><button className="viewerActionButton" style={{background:accent}} onClick={()=>onAction(v)}><MousePointerClick size={16}/>{v.buttonLabel||'Action'}</button></div>:v.type==='slicer'?(()=>{const field=v.bindings.axis?.[0]||'';const mode=v.slicerStyle||'list';return mode==='dropdown'?<select className="viewerSlicerDropdown" defaultValue="" onChange={e=>e.target.value&&onCrossFilter({field,operator:'equals',value:e.target.value})}><option value="">Select…</option>{rows.map((r,i)=><option key={i} value={String(r[field])}>{String(r[field])}</option>)}</select>:<div className={'viewerSlicerChips viewerSlicer-'+mode}>{rows.map((r,i)=><button key={i} onClick={()=>onCrossFilter({field,operator:'equals',value:r[field]})}>{String(r[field])}</button>)}</div>})():<Chart visual={v} rows={rows} onPointClick={(field,value)=>onCrossFilter({field,operator:'equals',value})}/>;
 const card=<div className={`viewerVisual viewerVisual-${v.type}`} style={{background:bg,borderColor:f.borderColor||'#d7e0ea',borderTopColor:accent,borderRadius:`${f.cornerRadii?.topLeft??f.cornerRadius??16}px ${f.cornerRadii?.topRight??f.cornerRadius??16}px ${f.cornerRadii?.bottomRight??f.cornerRadius??16}px ${f.cornerRadii?.bottomLeft??f.cornerRadius??16}px`,boxShadow:f.shadow?'0 12px 30px rgba(15,23,42,.12)':'0 8px 22px rgba(15,23,42,.08)','--viewer-accent':accent} as any}>
   {f.showTitle!==false&&<div className="viewerVisualTitle" style={{color:f.titleColor||(dark?'#fff':'#111827'),fontSize:f.titleFontSize||14,fontWeight:f.titleFontWeight||700}}><div className="viewerVisualTitleLabel"><span className="viewerVisualTitleIcon" style={{color:accent,background:`${accent}14`}}>{visualTitleIcon(v.type)}</span><div><span>{v.title}</span>{f.subtitleVisible&&f.subtitle&&<small>{f.subtitle}</small>}</div></div><button className="viewerVisualFocus" onClick={()=>setFocus(true)} title="Focus visual"><Maximize2 size={14}/></button></div>}
   <div className="viewerVisualBody">{err?<div className="viewerError">{err}</div>:content}</div>
 </div>;
 return <>{card}{focus&&createPortal(<div className="visualFocusBackdrop" onMouseDown={()=>setFocus(false)}><div className="visualFocusPanel viewerFocusPanel" onMouseDown={e=>e.stopPropagation()}><div className="visualFocusHeader"><div><small>FOCUS MODE</small><b>{v.title}</b></div><button onClick={()=>setFocus(false)}>Close</button></div><div className="visualFocusBody">{content}</div></div></div>,document.body)}</>
}
export default function PublishedViewer({reportId,initialItem,embedded=false,cloudMode=false}:{reportId:string,initialItem?:any,embedded?:boolean,cloudMode?:boolean}){
 const[item,setItem]=useState<any>(initialItem||null),[error,setError]=useState(''),[pageIndex,setPageIndex]=useState(0),[full,setFull]=useState(!embedded),[viewMode,setViewMode]=useState<'fitWidth'|'fitPage'|'actual'>('fitWidth'),[scale,setScale]=useState(1),[interactionFilters,setInteractionFilters]=useState<VisualFilter[]>([]),[runtimeHidden,setRuntimeHidden]=useState<Record<string,boolean>>({}),[authRequired,setAuthRequired]=useState(false),[signedIn,setSignedIn]=useState(true),[login,setLogin]=useState({email:'',password:''});
 const stageRef=useRef<HTMLElement|null>(null);
 const load=()=>{
  if(initialItem){setItem(initialItem);setError('');return;}
  if(WORKSPACE_ONLY){
   fetchReportFromSupabase(reportId).then(x=>{setItem(x);setError('')}).catch(e=>setError(e.message||String(e)));
   return;
  }
  api<any>(`/published/${reportId}`).then(x=>{setItem(x);setError('')}).catch(e=>setError(e.message||String(e)))
 };
 useEffect(()=>{
  if(initialItem){setItem(initialItem);setError('');return;}
  if(WORKSPACE_ONLY){load();return;}
  api<any>('/auth/status').then(s=>{setAuthRequired(!!s.required);if(s.required){api('/auth/me').then(()=>{setSignedIn(true);load()}).catch(()=>setSignedIn(false))}else load()})
 },[reportId,initialItem?.id]);
 const project=item?.project,report=project?.report,pages=report?.pages||[],page=pages[pageIndex]||pages[0],s=page?.settings||{};
 const width=s.pageWidth||1600,height=s.pageHeight||900;
 const visualBottom=(page?.visuals||[]).reduce((m:any,v:any)=>Math.max(m,(v.y||0)*70+(v.h||2)*54+Math.max(0,(v.h||2)-1)*16),0);
 const headerHeight=s.header?.visible!==false?(s.header?.height||84):0;
 const contentHeight=Math.max(480,headerHeight+34+visualBottom+(s.footerGap??96));
 const effectiveHeight=Math.max(height,contentHeight);
 useEffect(()=>{
   if(!item||!page)return;
   const stage=stageRef.current;if(!stage)return;
   const compute=()=>{
     const rect=stage.getBoundingClientRect();
     const availW=Math.max(320,rect.width-12),availH=Math.max(320,rect.height-12);
     let next=1;
     if(viewMode==='fitWidth')next=availW/width;
     else if(viewMode==='fitPage')next=Math.min(availW/width,availH/effectiveHeight);
     else next=1;
     setScale(Math.max(.1,next));
   };
   compute();const ro=new ResizeObserver(compute);ro.observe(stage);window.addEventListener('resize',compute);return()=>{ro.disconnect();window.removeEventListener('resize',compute)};
 },[width,effectiveHeight,viewMode,full,item?.id,page?.id]);
 useEffect(()=>{const stage=stageRef.current;if(stage)stage.scrollTo({top:0,left:0,behavior:'instant' as ScrollBehavior})},[pageIndex,viewMode,full,item?.id]);
 useEffect(()=>{setRuntimeHidden({});setInteractionFilters([])},[page?.id]);
 const doLogin=async()=>{try{const r=await api<any>('/auth/login',{method:'POST',body:JSON.stringify(login)});localStorage.setItem('vtab_workspace_token',r.token);setSignedIn(true);load()}catch(e:any){alert(e.message)}};
 if(authRequired&&!signedIn)return <div className="workspaceLogin"><div className="workspaceLoginCard"><div className="brandMark">V</div><h2>Sign in to VTAB Workspace</h2><p>This published report requires a workspace account.</p><input placeholder="Email" value={login.email} onChange={e=>setLogin({...login,email:e.target.value})}/><input type="password" placeholder="Password" value={login.password} onChange={e=>setLogin({...login,password:e.target.value})}/><button className="primary" onClick={doLogin}>Sign In</button></div></div>;
 if(error)return <div className="viewerLoading"><b>Published report could not be opened</b><span>{error}</span><button onClick={()=>location.href='/?workspace=1'}>Open Workspace</button></div>;
 if(!item)return <div className="viewerLoading">Opening published report…</div>;
 if(!page)return <div className="viewerLoading">This published report has no pages.</div>;
 const exportFile=(fmt:'pdf'|'pptx')=>apiDownload(`/published/${reportId}/export/${fmt}`,`${(report?.name||'VTAB_Report').replace(/[^A-Za-z0-9_-]+/g,'_')}.${fmt==='pdf'?'pdf':'pptx'}`).catch((e:any)=>alert(e.message));
 const shareEmail=()=>{const to=window.prompt('Recipient email(s), comma separated:','');if(!to)return;const attach=(window.prompt('Attachment: none, pdf or pptx','none')||'none').toLowerCase();api(`/published/${reportId}/share-email`,{method:'POST',body:JSON.stringify({to,attach:attach==='none'?'':attach,subject:`VTAB Report: ${report.name}`,message:'A VTAB Workspace report has been shared with you.',reportUrl:location.href})}).then(()=>alert('Report shared by email.')).catch((e:any)=>alert(e.message))};
 const executeAction=(v:Visual)=>{const a=v.action;if(!a||a.type==='none')return;if(a.type==='navigate'&&a.targetPageId){const i=pages.findIndex((p:any)=>p.id===a.targetPageId);if(i>=0){setPageIndex(i);setInteractionFilters([])}return}if(a.type==='clearFilters'){setInteractionFilters([]);return}if(a.targetVisualId&&['toggleVisual','showVisual','hideVisual'].includes(a.type||'')){setRuntimeHidden(h=>{const n={...h};if(a.type==='toggleVisual')n[a.targetVisualId!]=!n[a.targetVisualId!];if(a.type==='showVisual')n[a.targetVisualId!]=false;if(a.type==='hideVisual')n[a.targetVisualId!]=true;return n})}};
 return <div className={'publishedViewer '+(full?'viewerFull':'')}>
  <header className="viewerTopbar"><div className="viewerBrand"><span>V</span><div><b>VTAB Workspace</b><small>Published Analytics</small></div></div><div className="viewerReportName"><small>PUBLISHED REPORT</small><b>{report.name}</b></div><div className="viewerActions"><span><ShieldCheck size={14}/>Governed</span><span><CalendarDays size={14}/>{new Date(item.updated_at||item.published_at).toLocaleString()}</span>{interactionFilters.length>0&&<button onClick={()=>setInteractionFilters([])}><Eraser size={15}/>Clear Selection</button>}<button onClick={load}><RefreshCcw size={15}/>Refresh</button><button onClick={()=>exportFile('pdf')}><FileDown size={15}/>PDF</button><button onClick={()=>exportFile('pptx')}><Presentation size={15}/>PPT</button><button onClick={shareEmail}><Mail size={15}/>Share</button><div className="viewerViewModes"><button className={viewMode==='fitPage'?'active':''} onClick={()=>setViewMode('fitPage')} title="Show the complete report page"><Scaling size={15}/>Full Report</button><button className={viewMode==='fitWidth'?'active':''} onClick={()=>setViewMode('fitWidth')} title="Fit report to browser width"><MonitorUp size={15}/>Fit Width</button><button className={viewMode==='actual'?'active':''} onClick={()=>setViewMode('actual')} title="Use report design size"><Expand size={15}/>Actual</button></div><button onClick={()=>setFull(x=>!x)}>{full?<Minimize2 size={15}/>:<Maximize2 size={15}/>}{full?'Exit Full Screen':'Full Screen'}</button><button onClick={()=>location.href='/?workspace=1'}><Home size={15}/>Workspace</button></div></header>
  <main className="viewerStage" ref={stageRef}>
   <div className="viewerScaleFrame" style={{width:width*scale,height:effectiveHeight*scale}}>
   <div className="viewerPage" style={{width,height:effectiveHeight,background:s.background||'#f5f7fb',transform:`scale(${scale})`}}>
    {s.backgroundImage&&<div className="viewerPageBg" style={{backgroundImage:`url(${s.backgroundImage})`,backgroundSize:s.backgroundImageFit||'cover',opacity:(s.backgroundImageOpacity??24)/100}}/>}
    <div className="viewerPageLayer">
     {s.header?.visible!==false&&<div className="viewerDashboardHeader" style={{background:s.header?.background||'#fff','--viewer-header-bg':s.header?.background||'#fff','--viewer-header-height':`${s.header?.height||84}px`,'--viewer-header-pad-top':`${s.header?.paddingTop??12}px`,'--viewer-header-pad-bottom':`${s.header?.paddingBottom??12}px`,'--viewer-header-pad-left':`${s.header?.paddingLeft??24}px`,'--viewer-header-pad-right':`${s.header?.paddingRight??24}px`,'--viewer-header-radius':`${s.header?.borderRadius??14}px`,'--viewer-header-title-size':`${s.header?.fontSize||28}px`,'--viewer-header-title-color':s.header?.titleColor||'#111827','--viewer-header-subtitle-size':`${s.header?.subtitleFontSize||12}px`,'--viewer-header-subtitle-color':s.header?.subtitleColor||'#475569'} as any}><div className="viewerDashboardHeaderCopy" style={{textAlign:s.header?.alignment||'left'}}><h1 style={{color:s.header?.titleColor||'#111827'}}>{s.header?.title&&s.header.title!=='Dashboard Title'?s.header.title:report.name}</h1><p style={{color:s.header?.subtitleColor||'#475569'}}>{s.header?.subtitle||'Executive overview of business performance and key insights'}</p></div>{s.header?.showGeneratedInfo!==false&&<div className="viewerReportMeta" style={{background:s.header?.generatedInfoBackground||'#f8fbff'}}><CalendarDays size={20}/><div><small>REPORT GENERATED</small><b>{new Date(item.updated_at||item.published_at).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})}</b><span>{new Date(item.updated_at||item.published_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div></div>}</div>}
     <div className="viewerGrid">{page.visuals.filter((v:Visual)=>!v.hidden&&!runtimeHidden[v.id]).map((v:Visual)=><div key={v.id} style={{gridColumn:`${v.x+1} / span ${v.w}`,gridRow:`${v.y+1} / span ${v.h}`}}><ViewerVisual reportId={reportId} v={v} roleId={project.security?.activeRoleId} extraFilters={interactionFilters} onCrossFilter={f=>setInteractionFilters(f?[f]:[])} onAction={executeAction} project={cloudMode?project:undefined}/></div>)}{page.visuals.filter((v:Visual)=>!v.hidden&&!runtimeHidden[v.id]).length===0&&<div className="viewerEmptyPage"><b>No visible visuals on this published page</b><span>Open this page in Report Designer, verify visual visibility, save the report, and publish again.</span></div>}</div>
    </div>
   </div>
   </div>
  </main>
  <footer className="viewerFooter"><button onClick={()=>setPageIndex(i=>Math.max(0,i-1))} disabled={pageIndex===0}><ChevronLeft size={15}/>Previous</button><div className="viewerPages">{pages.map((p:any,i:number)=><button key={p.id} className={i===pageIndex?'active':''} onClick={()=>setPageIndex(i)}>{p.name}</button>)}</div><span>Page {pageIndex+1} of {pages.length}</span><button onClick={()=>setPageIndex(i=>Math.min(pages.length-1,i+1))} disabled={pageIndex===pages.length-1}>Next<ChevronRight size={15}/></button></footer>
 </div>
}
