import{Home,Database,Workflow,Network,ChartNoAxesCombined,Files,ShieldCheck,CloudUpload,Sparkles,Calculator,BrainCircuit,PanelLeftClose,PanelLeftOpen,PackageOpen}from'lucide-react';
import{useStudio}from'../store';

const items=[
  ['home','Home',Home,'#2563eb'],
  ['data','Get Data',Database,'#16a34a'],
  ['transform','Transform',Workflow,'#0ea5e9'],
  ['model','Model',Network,'#3b82f6'],
  ['ai-measures','AI Measures',BrainCircuit,'#7c3aed'],
  ['measures','Measures',Calculator,'#8b5cf6'],
  ['report','Report Designer',ChartNoAxesCombined,'#0284c7'],
  ['reports','Saved Reports',Files,'#16a34a'],
  ['security','Security',ShieldCheck,'#22c55e'],
  ['packages','Packages',PackageOpen,'#7c3aed'],
  ['publish','Publish',CloudUpload,'#2563eb'],
] as const;

export default function Sidebar(){
  const{view,setView}=useStudio() as any;
  return (
    <aside className="sidebar">
      {/* ── Brand row ── */}
      <div className="brand">
        <div className="brandMark">V</div>
        <div className="brandName">VTAB <span style={{fontWeight:400, opacity:0.8}}>Studio</span></div>
      </div>

      {/* ── Nav items ── */}
      <nav className="navDock">
        {items.map(([id,label,Icon,color])=>(
          <button
            key={id}
            className={`navItem ${view===id?'active':''}`}
            onClick={()=>setView(id)}
            style={{'--nav-accent':color} as any}
            title={label}
          >
            <span className="navIcon"><Icon size={20} strokeWidth={2}/></span>
            <span className="navLabel">{label}</span>
          </button>
        ))}
      </nav>

      <div style={{flex: 1}}></div>

      {/* ── Copilot ── */}
      <button
        className="navItem copilotItem"
        onClick={()=>setView('copilot')}
        title="Copilot"
      >
        <span className="navIcon"><Sparkles size={20} strokeWidth={2}/></span>
        <span className="navLabel">Copilot</span>
      </button>

      <button
        className="navItem"
        style={{marginTop: 8}}
        onClick={async () => {
          try {
            const { supabase } = await import('../supabase');
            if (supabase) await supabase.auth.signOut();
          } catch {}
          localStorage.removeItem('vtab_supabase_token');
          localStorage.removeItem('vtab_workspace_token');
          location.href = '/';
        }}
        title="Sign Out"
      >
        <span className="navIcon"><PanelLeftClose size={20} strokeWidth={2}/></span>
        <span className="navLabel">Sign Out</span>
      </button>
    </aside>
  );
}
