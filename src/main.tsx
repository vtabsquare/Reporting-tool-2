import React from 'react';
import{createRoot}from'react-dom/client';
import'./styles.css';
import'@xyflow/react/dist/style.css';

const root=createRoot(document.getElementById('root')!);

function StartupError({error}:{error:any}){
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',background:'#eef4f8',color:'#111827',fontFamily:'Aptos, Segoe UI, sans-serif',padding:24}}>
    <div style={{maxWidth:720,width:'100%',background:'#fff',border:'1px solid #cbd5e1',borderRadius:16,padding:28,boxShadow:'0 18px 55px #0f172a22'}}>
      <div style={{fontSize:12,fontWeight:800,letterSpacing:'.12em',color:'#2563eb'}}>VTAB REPORTING STUDIO</div>
      <h2 style={{margin:'10px 0 8px',fontSize:26}}>The application could not start</h2>
      <p style={{lineHeight:1.6,color:'#334155'}}>A frontend startup error occurred before the normal workspace could render.</p>
      <pre style={{whiteSpace:'pre-wrap',background:'#0b1725',color:'#fff',padding:14,borderRadius:10,overflow:'auto'}}>{String(error?.stack||error?.message||error)}</pre>
      <button onClick={()=>location.reload()} style={{marginTop:12,border:0,borderRadius:9,padding:'10px 16px',background:'#2563eb',color:'#fff',fontWeight:700,cursor:'pointer'}}>Reload Application</button>
    </div>
  </div>
}

import('./studio').then(({default:Studio})=>{
  root.render(<React.StrictMode><Studio/></React.StrictMode>);
}).catch(error=>{
  console.error('VTAB startup error',error);
  root.render(<StartupError error={error}/>);
});
