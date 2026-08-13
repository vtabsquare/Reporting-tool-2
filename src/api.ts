// Detect Tauri desktop context across all platforms:
//  - tauri://localhost  → Linux / macOS (Tauri v2)
//  - http://tauri.localhost → Windows (Tauri v2, WebView2)
//  - window.__TAURI__ global → injected by Tauri in all versions
// In any of these cases we MUST use the absolute backend URL because
// there is no dev-server proxy available in the packaged app.
const _envBaseRaw=(import.meta as any).env?.VITE_API_URL;
let _envBase: string | undefined = undefined;
if (typeof _envBaseRaw === 'string' && !/\.supabase\.co/i.test(_envBaseRaw)) {
  _envBase = _envBaseRaw.replace(/\/+$/, ''); // strip trailing slash
  if (!_envBase.endsWith('/api/v1')) {
    _envBase += '/api/v1'; // auto-append path if user forgot it
  }
}
const _isTauri=typeof window!=='undefined'&&(
  window.location.protocol==='tauri:'||
  window.location.hostname==='tauri.localhost'||
  !!(window as any).__TAURI__
);
const FALLBACK_BASE=_envBase||(_isTauri?'http://127.0.0.1:8820/api/v1':'/api/v1');
let runtimeBase:string|undefined;
async function apiBase():Promise<string>{
  if(runtimeBase)return runtimeBase;
  if(_isTauri){
    const invoke=(window as any).__TAURI__?.core?.invoke||(window as any).__TAURI__?.invoke;
    if(invoke){
      try{const value=await invoke('api_base');if(typeof value==='string'&&value){runtimeBase=value;return value;}}catch{}
    }
  }
  return FALLBACK_BASE;
}
export function authHeaders():Record<string,string>{const token=localStorage.getItem('vtab_workspace_token')||localStorage.getItem('vtab_supabase_token');return token?{'Authorization':`Bearer ${token}`}:{}}
function mergeHeaders(base:Record<string,string>,extra?:HeadersInit){const h=new Headers(extra||{});Object.entries(base).forEach(([k,v])=>h.set(k,v));return h}
export async function api<T>(path:string,init?:RequestInit):Promise<T>{
  const base=await apiBase();
  let r:Response;
  try{r=await fetch(base+path,{...init,headers:mergeHeaders({'Content-Type':'application/json',...authHeaders()},init?.headers)});}
  catch(e:any){throw new Error(`Cannot reach VTAB API at ${base}. ${e?.message||e}`)}
  if(!r.ok){const text=await r.text();throw new Error(`API ${r.status}: ${text||r.statusText}`)}
  return r.json();
}
export async function apiForm<T>(path:string,form:FormData,init?:RequestInit):Promise<T>{
  const base=await apiBase();
  let r:Response;
  try{r=await fetch(base+path,{...init,method:init?.method||'POST',headers:mergeHeaders(authHeaders(),init?.headers),body:form});}
  catch(e:any){throw new Error(`Cannot reach VTAB API at ${base}. ${e?.message||e}`)}
  if(!r.ok){const text=await r.text();throw new Error(`API ${r.status}: ${text||r.statusText}`)}
  return r.json();
}
export async function apiDownload(path:string,filename:string){
  const base=await apiBase();
  const r=await fetch(base+path,{headers:mergeHeaders(authHeaders())});
  if(!r.ok) throw new Error(`Export failed (${r.status}): ${await r.text()}`);
  const blob=await r.blob();

  // In Tauri desktop, blob-URL clicks are blocked by WebView2.
  // Use the native save_file_dialog Tauri command instead.
  if(_isTauri){
    const invoke=(window as any).__TAURI__?.core?.invoke||(window as any).__TAURI__?.invoke;
    if(invoke){
      try{
        const arrayBuffer=await blob.arrayBuffer();
        const bytes=Array.from(new Uint8Array(arrayBuffer));
        const saved=await invoke('save_file_dialog',{bytes,filename});
        if(!saved) return; // user cancelled
        return;
      }catch(e:any){
        // Fall through to browser method if tauri command fails
        console.warn('save_file_dialog failed, falling back to browser download:',e);
      }
    }
  }

  // Browser fallback
  const u=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=u;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(u),2000);
}

export const API_BASE=FALLBACK_BASE;
