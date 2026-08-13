import{Search,Undo2,Redo2,Save,CloudUpload,Files,Palette,ChevronDown}from'lucide-react';
import{useState}from'react';
import{useStudio}from'../store';
import{api}from'../api';

const ACCENTS=[
 {id:'corporate-blue',name:'Corporate Blue',value:'#2563eb'},
 {id:'azure',name:'Azure Blue',value:'#0284c7'},
 {id:'emerald',name:'Emerald Green',value:'#16a34a'}
];

export default function Topbar(){
 const{project,undo,redo,canUndo,canRedo,replaceProject,setView,view}=useStudio() as any;
 const[appearanceOpen,setAppearanceOpen]=useState(false);
 const editing=view==='report';
 const theme=project?.appTheme||'vtab';
 const rawAccent=project?.appAccent||'#2563eb';
 const accent=rawAccent.toLowerCase()==='#22d3ee'?'#2563eb':rawAccent;
 const density=project?.uiDensity||'comfortable';

 const patchProject=async(patch:any)=>{
   if(!project)return;
   const p=structuredClone(project);
   Object.assign(p,patch);
   replaceProject(p);
   try{await api('/project',{method:'PUT',body:JSON.stringify(p)})}catch{}
 };
 const setTheme=async(value:'vtab'|'black'|'white')=>{document.documentElement.dataset.theme=value;await patchProject({appTheme:value})};
 const setAccent=async(value:string)=>{document.documentElement.style.setProperty('--brand-accent',value);await patchProject({appAccent:value})};
 const setDensity=async(value:'compact'|'comfortable'|'spacious')=>{document.documentElement.dataset.density=value;await patchProject({uiDensity:value})};
  const[promptDialog,setPromptDialog]=useState<{title:string,defaultValue:string,onConfirm:(val:string)=>void}|null>(null);

  const save=async()=>{
    if(!project)return;
    const executeSave = async () => {
      try{
        await api('/project',{method:'PUT',body:JSON.stringify(project)});
        alert('Report and authoring project saved.');
      }catch(e:any){alert(e.message)}
    };

    let name=(project.report.name||'').trim();
    if(!name||name==='Untitled Report'){
      setPromptDialog({
        title: 'Report name',
        defaultValue: name || 'Untitled Report',
        onConfirm: (entered) => {
          setPromptDialog(null);
          if (!entered) return;
          project.report.name=entered.trim()||'Untitled Report';
          executeSave();
        }
      });
    } else {
      executeSave();
    }
  };

 const currentAccent=ACCENTS.find(a=>a.value.toLowerCase()===accent.toLowerCase())?.name||'Custom';
 return (
  <header className="topbarGlass">
    <div className="crumbGlass">
      <span className="crumbTitle">{editing?(project?.report?.name||'Untitled Report'):(project?.name||'Loading...')}</span>
      <span className="buildBadgeGlass">v4.0</span>
    </div>
    
    <div className="topActionsGlass">
      <div className="searchGlass">
        <Search size={16} className="searchIcon"/>
        <input placeholder="Search reports, data..." />
      </div>
      
      <div className="appearanceMenuWrap">
        <button className="btnGlass" onClick={()=>setAppearanceOpen(x=>!x)}><Palette size={16}/><span>Appearance</span><ChevronDown size={14}/></button>
        {appearanceOpen&&<div className="appearancePopoverGlass" onMouseLeave={()=>setAppearanceOpen(false)}>
          <div className="appearanceHeader"><b>Appearance</b><span>Theme, accent and density settings.</span></div>
          <label>Theme<select value={theme} onChange={e=>setTheme(e.target.value as any)}><option value="vtab">System Default</option><option value="black">Dark Mode</option><option value="white">Light Mode</option></select></label>
          <label>Accent<select value={ACCENTS.some(a=>a.value===accent)?accent:'#22d3ee'} onChange={e=>setAccent(e.target.value)}>{ACCENTS.map(a=><option key={a.id} value={a.value}>{a.name}</option>)}</select></label>
          <label>Spacing<select value={density} onChange={e=>setDensity(e.target.value as any)}><option value="spacious">Spacious</option><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></label>
        </div>}
      </div>
      
      <div className="actionGroupGlass">
        <button className="btnIconGlass" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo}><Undo2 size={16}/></button>
        <button className="btnIconGlass" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={redo}><Redo2 size={16}/></button>
      </div>

      <button className="btnGlass" onClick={()=>setView('reports')}><Files size={16}/><span>Reports</span></button>
      <button className="btnGlass primary" onClick={save}><Save size={16}/><span>Save</span></button>
      <button className="btnGlass primary" onClick={()=>setView('publish')}><CloudUpload size={16}/><span>Publish</span></button>
    </div>
    {promptDialog&&<div className="fancyDialogOverlay" onClick={()=>setPromptDialog(null)}>
      <div className="fancyDialogContent" onClick={e=>e.stopPropagation()}>
        <div className="fancyDialogHeader">
          <h3>{promptDialog.title}</h3>
          <p>Give your report a clear, descriptive name. You can rename it anytime.</p>
        </div>
        <div className="fancyDialogInputWrap">
          <input id="topbar-prompt-input" autoFocus className="fancyDialogInput" defaultValue={promptDialog.defaultValue} onKeyDown={e=>{if(e.key==='Enter')promptDialog.onConfirm(e.currentTarget.value);if(e.key==='Escape')setPromptDialog(null)}} placeholder="e.g. Q3 Sales Report"/>
          <button className="fancyDialogClearBtn" onClick={()=>{const el=document.getElementById('topbar-prompt-input') as HTMLInputElement;if(el){el.value='';el.focus()}}} title="Clear">×</button>
        </div>
        <div className="fancyDialogActions">
          <button className="btnGlass" onClick={()=>setPromptDialog(null)}>Cancel</button>
          <button className="btnGlass primary" onClick={()=>{const el=document.getElementById('topbar-prompt-input') as HTMLInputElement;promptDialog.onConfirm(el?.value??'')}}>Continue →</button>
        </div>
      </div>
    </div>}
  </header>
 );
}
