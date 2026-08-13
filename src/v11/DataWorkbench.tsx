import {useEffect,useRef,useState} from 'react';
import {Database,FileSpreadsheet,FileJson,UploadCloud,RefreshCcw,Plus,Cloud,Table2,CheckCircle2,HardDrive,Zap,Gauge,PanelLeftClose,PanelLeftOpen,Trash2,FolderOpen,Combine} from 'lucide-react';
import {api,apiForm} from '../api';import {useStudio} from '../store';

type Meta={schema:string,name:string,type:string,rowCount?:number,managed?:boolean,storage?:any,columns:{name:string,type:string,nullable:boolean,pk:boolean}[]};
type StorageStats={engine:string,tables:number,sourceBytes:number,compressedBytes:number,compressionRatio?:number|null,target:string,threads:number,memoryLimit:string,queryCache?:any};
export default function DataWorkbench(){
 const{load,setView,project}=useStudio();const[sourcesVisible,setSourcesVisible]=useState(true);const[activeSource,setActiveSource]=useState('none');const[storage,setStorage]=useState<StorageStats|null>(null);const[meta,setMeta]=useState<Meta[]>([]);const[selected,setSelected]=useState<Meta|null>(null);const[busy,setBusy]=useState(false);const[msg,setMsg]=useState('');const[fileRef]=[useRef<HTMLInputElement>(null)];const[folderRef]=[useRef<HTMLInputElement>(null)];const[cloud,setCloud]=useState<string>('google_sheets');const[url,setUrl]=useState('');const[connectorCatalog,setConnectorCatalog]=useState<any[]>([]);
 const refresh=()=>api<Meta[]>('/metadata').then(x=>{setMeta(x);if(selected)setSelected(x.find(z=>z.name===selected.name)||null)});
 const refreshStorage=()=>api<StorageStats>('/storage/stats').then(setStorage).catch(()=>{});
 const optimizeStorage=async()=>{setBusy(true);setMsg('Optimizing local columnar storage…');try{const r=await api<StorageStats>('/storage/optimize',{method:'POST'});setStorage(r);setMsg(`Storage optimized. ${r.compressionRatio?`${r.compressionRatio}× actual compression across measured imports.`:'ZSTD columnar files rewritten.'}`)}catch(e:any){setMsg(e.message)}finally{setBusy(false)}};
 const startTransform=async(table:string,queryName?:string)=>{const existing=project?.transform.queries.find((q:any)=>q.source===table);if(existing){setView('transform');return;}const r=await api<any>('/transform/add-source',{method:'POST',body:JSON.stringify({physicalTable:table,queryName})});await load();setMsg(`${r.queryName} added to Transform. Build ETL steps, then Close & Apply to create this report's model table.`);setView('transform')};
 useEffect(()=>{refresh();refreshStorage();api<any[]>('/connectors').then(setConnectorCatalog).catch(()=>{})},[]);
 async function importOneFile(file:File,uploadName?:string){const fd=new FormData();fd.append('file',file,uploadName||file.name);return await apiForm<any>('/files/import',fd)}
 async function showImportedInData(imported:any[],message:string){const fresh=await api<Meta[]>('/metadata');setMeta(fresh);const first=imported[0]?.table;setSelected(fresh.find(x=>x.name===first)||null);setActiveSource('workspace');await refreshStorage();await load();setMsg(message)}
 async function uploadFiles(files:File[]){if(!files.length)return;setBusy(true);setMsg('');try{const imported:any[]=[];for(const file of files){setMsg(`Importing ${file.name} (${imported.length+1}/${files.length})…`);const d=await importOneFile(file);imported.push(d);if(!project?.transform.queries.find((q:any)=>q.source===d.table)){await api<any>('/transform/add-source',{method:'POST',body:JSON.stringify({physicalTable:d.table,queryName:d.table.replace('Imported_','')})})}}await showImportedInData(imported,`${imported.length} data source${imported.length===1?'':'s'} imported. The new table${imported.length===1?' is':'s are'} visible here in Data and already available in Transform.`)}catch(e:any){setMsg('Import failed: '+e.message)}finally{setBusy(false)}}
 function openFolderPicker(){const el=folderRef.current;if(!el)return;el.setAttribute('webkitdirectory','');el.setAttribute('directory','');el.value='';el.click()}
 async function appendFolderFiles(files:File[]){const supported=files.filter(f=>/\.(csv|tsv|txt|xlsx|xls|json|jsonl|parquet|xml)$/i.test(f.name));if(!supported.length){setMsg('No supported CSV, Excel, or JSON files were found in the selected folder.');return}setBusy(true);setMsg('');try{const staged:any[]=[];const root=((supported[0] as any).webkitRelativePath||'Folder').split('/')[0]||'Folder';for(let i=0;i<supported.length;i++){const f=supported[i];const rel=((f as any).webkitRelativePath||f.name).replace(/[\\/]+/g,'_');setMsg(`Folder import: ${i+1}/${supported.length} · ${rel}`);staged.push(await importOneFile(f,rel))}setMsg(`Appending ${staged.length} imported files into one table…`);const result=await api<any>('/files/append-tables',{method:'POST',body:JSON.stringify({tables:staged.map(x=>x.table),name:`${root}_Combined`,schemaMode:'by_name',removeSources:true})});if(!project?.transform.queries.find((q:any)=>q.source===result.table)){await api<any>('/transform/add-source',{method:'POST',body:JSON.stringify({physicalTable:result.table,queryName:result.table.replace('Imported_','')})})}await showImportedInData([result],`${supported.length} file${supported.length===1?'':'s'} from ${root} were appended into ${result.table} (${Number(result.rows||0).toLocaleString()} rows). ${result.warnings?.length?result.warnings.join(' '):'Columns were aligned safely by name.'}`)}catch(e:any){setMsg('Folder append failed: '+e.message)}finally{setBusy(false)}}
 async function importCloud(){if(!url)return;setBusy(true);setMsg('');try{const d=await api<any>('/cloud/import',{method:'POST',body:JSON.stringify({sourceType:cloud,url})});if(!project?.transform.queries.find((q:any)=>q.source===d.table)){await api<any>('/transform/add-source',{method:'POST',body:JSON.stringify({physicalTable:d.table,queryName:d.table.replace('Imported_','')})})}await showImportedInData([d],`${d.table} imported and is now visible in Data and available in Transform.`)}catch(e:any){setMsg(e.message)}finally{setBusy(false)}}
 async function useInTransform(){if(!selected)return;setBusy(true);try{await startTransform(selected.name,selected.name.replace('Imported_',''))}catch(e:any){setMsg(e.message)}finally{setBusy(false)}}
 async function deleteTable(){if(!selected)return;if(!selected.managed){setMsg('Reference/demo tables are protected. Only imported, processed, or generated tables can be deleted.');return}if(!confirm(`Delete ${selected.name}? This also removes ETL queries and semantic-model tables that depend directly on it.`))return;setBusy(true);try{const r=await api<any>('/data/tables/'+encodeURIComponent(selected.name),{method:'DELETE'});setSelected(null);await refresh();await refreshStorage();await load();setMsg(`Deleted ${r.table}. Related queries/model tables were removed.`)}catch(e:any){setMsg(e.message)}finally{setBusy(false)}}

 return <div className={'workspaceGlass '+(!sourcesVisible?'dataSourcesHidden':'')}>
  {sourcesVisible&&<div className="paneGlass leftPaneGlass">
    <div className="paneTitleGlass"><span>Get Data</span><button className="iconGlass paneCollapseBtn" onClick={()=>setSourcesVisible(false)} title="Hide source navigation"><PanelLeftClose size={15}/></button></div>
    <div className="sourceGroupGlass">
      <small>WORKSPACE</small>
      <button className={'sourceGlass '+(activeSource==='workspace'?'active':'')} onClick={()=>{setActiveSource('workspace');setSelected(null)}}><Table2 size={16}/>Workspace Data</button>
    </div>
    <div className="sourceGroupGlass">
      <small>DATABASES</small>
      <button className={'sourceGlass '+(activeSource==='sqlserver'?'active':'')} onClick={()=>{setActiveSource('sqlserver');setSelected(null)}}><Database size={16}/>SQL Server / Azure SQL</button>
      <button className={'sourceGlass '+(activeSource==='postgresql'?'active':'')} onClick={()=>{setActiveSource('postgresql');setSelected(null)}}><Database size={16}/>PostgreSQL</button>
    </div>
    <div className="sourceGroupGlass">
      <small>FILES</small>
      <button className="sourceGlass" onClick={()=>fileRef.current?.click()}><FileSpreadsheet size={16}/>CSV / Excel</button>
      <button className="sourceGlass" onClick={()=>fileRef.current?.click()}><FileJson size={16}/>JSON</button>
      <button className="sourceGlass folderAppendSource" onClick={openFolderPicker}><FolderOpen size={16}/>Folder → Append</button>
      <input ref={fileRef} hidden multiple type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.json,.jsonl,.parquet,.xml" onChange={e=>{uploadFiles(Array.from(e.target.files||[]));e.currentTarget.value=''}}/>
      <input ref={folderRef} hidden multiple type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.json,.jsonl,.parquet,.xml" onChange={e=>{appendFolderFiles(Array.from(e.target.files||[]));e.currentTarget.value=''}}/>
    </div>
    <div className="sourceGroupGlass">
      <small>CLOUD</small>
      <button className={'sourceGlass '+(activeSource==='sharepoint'?'active':'')} onClick={()=>{setCloud('sharepoint');setActiveSource('sharepoint');setSelected(null)}}><Cloud size={16}/>SharePoint</button>
      <button className={'sourceGlass '+(activeSource==='onedrive'?'active':'')} onClick={()=>{setCloud('onedrive');setActiveSource('onedrive');setSelected(null)}}><Cloud size={16}/>OneDrive</button>
      <button className={'sourceGlass '+(activeSource==='google_sheets'?'active':'')} onClick={()=>{setCloud('google_sheets');setActiveSource('google_sheets');setSelected(null)}}><Cloud size={16}/>Google Sheets</button>
    </div>
    <div className="sourceGroupGlass enterpriseSources">
      <small>ENTERPRISE / MORE SOURCES</small>
      {connectorCatalog.filter((c:any)=>!['sqlserver','postgresql','csv','excel','json','sharepoint','onedrive','google_sheets','folder'].includes(c.id)).map((c:any)=><button key={c.id} className={'sourceGlass '+(activeSource===c.id?'active':'')} onClick={()=>{setActiveSource(c.id);setSelected(null)}} title={c.mode}><Database size={16}/>{c.name}</button>)}
    </div>
  </div>}

  <div className="mainPanelGlass">
    {!sourcesVisible&&<button className="floatingPaneRestore leftRestore" onClick={()=>setSourcesVisible(true)}><PanelLeftOpen size={15}/>Sources</button>}
    {activeSource==='none'?<div className="connectorFocusGlass">
      <div className="connectorFocusCardGlass">
        <div className="landingTitleRowGlass"><div><span className="eyebrowGlass">GET DATA</span>
        <h2>Choose a Data Source</h2></div>{!sourcesVisible&&<button className="panelRestoreBtnGlass" onClick={()=>setSourcesVisible(true)}><PanelLeftOpen size={15}/>Show Sources</button>}</div>
        <p>Start with one or several sources. Multi-file import keeps each file as a separate managed table. <b>Folder → Append</b> selects all supported files and builds one combined table. After every import, VTAB returns here to the Data page.</p>
        <div className="dataBatchHintGlass"><b>Folder append:</b> files are streamed into columnar staging tables, schemas aligned by column name, and appended into one Parquet/ZSTD table.</div>
        <div className="sourceLandingGridGlass">
          <button className="sourceCardGlass" onClick={()=>setActiveSource('sqlserver')}><span className="sourceCardIconGlass"><Database size={24}/></span><b>SQL Server</b></button>
          <button className="sourceCardGlass" onClick={()=>setActiveSource('postgresql')}><span className="sourceCardIconGlass"><Database size={24}/></span><b>PostgreSQL</b></button>
          <button className="sourceCardGlass excelCard" onClick={()=>fileRef.current?.click()}><span className="sourceCardIconGlass"><FileSpreadsheet size={24}/></span><b>CSV / Excel</b></button>
          <button className="sourceCardGlass" onClick={()=>fileRef.current?.click()}><span className="sourceCardIconGlass"><FileJson size={24}/></span><b>JSON</b></button>
          <button className="sourceCardGlass folderAppendCard" onClick={openFolderPicker}><span className="sourceCardIconGlass"><Combine size={24}/></span><b>Folder → Append</b></button>
          <button className="sourceCardGlass" onClick={()=>{setCloud('sharepoint');setActiveSource('sharepoint')}}><span className="sourceCardIconGlass"><Cloud size={24}/></span><b>SharePoint</b></button>
          <button className="sourceCardGlass" onClick={()=>{setCloud('onedrive');setActiveSource('onedrive')}}><span className="sourceCardIconGlass"><Cloud size={24}/></span><b>OneDrive</b></button>
          <button className="sourceCardGlass" onClick={()=>{setCloud('google_sheets');setActiveSource('google_sheets')}}><span className="sourceCardIconGlass"><Cloud size={24}/></span><b>Google Sheets</b></button>
        </div>
        <div className="storageAccelerationCardGlass">
          <div className="storageIcon"><Zap size={20}/></div>
          <div><small>LOCAL ACCELERATION ENGINE</small><b>{storage?.engine||'DuckDB + Parquet ZSTD'}</b><span>Columnar storage, filter/projection pushdown, and query caching.</span></div>
          <div className="storageMetric"><strong>{storage?.compressionRatio?`${storage.compressionRatio}×`:'—'}</strong><span>measured compression</span></div>
          <button className="btnGlass" onClick={optimizeStorage} disabled={busy}><Gauge size={14}/>Optimize</button>
        </div>
        <button className="btnGlass primary" style={{marginTop:24}} onClick={()=>setActiveSource('workspace')}><Table2 size={16}/>Browse Workspace Data</button>
      </div>
    </div>:activeSource==='workspace'?<>
      <div className="panelHeaderGlass">
        <div><span className="eyebrowGlass">DATA NAVIGATOR</span><h2>Workspace Data</h2><p>Existing workspace tables are reusable sources. Use them in Transform to add to the model.</p></div>
        <div className="toolbarGlass">{!sourcesVisible&&<button className="btnGlass" onClick={()=>setSourcesVisible(true)}><PanelLeftOpen size={15}/>Show Sources</button>}<button className="btnGlass" onClick={()=>{refresh();refreshStorage()}}><RefreshCcw size={15}/>Refresh</button><button className="btnGlass" onClick={optimizeStorage}><Zap size={15}/>Optimize</button><button className="btnGlass" onClick={openFolderPicker}><FolderOpen size={15}/>Folder Append</button><button className="btnGlass primary" onClick={()=>fileRef.current?.click()}><Plus size={15}/>Add Files</button></div>
      </div>
      {msg&&<div className="successBannerGlass"><CheckCircle2 size={16}/>{msg}</div>}
      <div className="navigatorGlass">
        <div className="objectListGlass">{meta.map(t=><button key={t.name} onClick={()=>setSelected(t)} className={selected?.name===t.name?'selected':''}><Table2 size={16}/><div><b>{t.name}</b><small>{t.rowCount?.toLocaleString()||0} rows · {t.columns.length} cols {t.managed?'· Columnar':''}</small></div></button>)}</div>
        <div className="objectDetailsGlass">{selected?<><div className="objectHeroGlass"><div><small>{selected.schema} · {selected.managed?'MANAGED IMPORT':'TABLE'}</small><h3>{selected.name}</h3></div><div className="toolbarGlass"><span className="pillGlass">{selected.managed?'ZSTD Columnar':'Reference'}</span>{selected.storage?.compressedBytes&&<span className="pillGlass">{(selected.storage.compressedBytes/1024/1024).toFixed(2)} MB</span>}<button className="btnGlass primary" onClick={useInTransform}>Use in Transform</button>{selected.managed&&<button className="btnGlass danger" onClick={deleteTable}><Trash2 size={14}/>Delete Table</button>}</div></div><table className="tableGlass"><thead><tr><th>Column</th><th>Type</th><th>Nullable</th><th>Key</th></tr></thead><tbody>{selected.columns.map(c=><tr key={c.name}><td>{c.name}</td><td><span className="typeBadgeGlass">{c.type||'TEXT'}</span></td><td>{c.nullable?'Yes':'No'}</td><td>{c.pk?'PK':''}</td></tr>)}</tbody></table></>:<div className="emptyGlass">Select a workspace table to inspect it.</div>}</div>
      </div>
    </>:<div className="connectorFocusGlass">
      <div className="connectorFocusCardGlass">
        <span className="eyebrowGlass">GET DATA</span>
        <h2>{connectorCatalog.find((c:any)=>c.id===activeSource)?.name || (activeSource==='google_sheets'?'Google Sheets':activeSource==='sharepoint'?'SharePoint':activeSource==='onedrive'?'OneDrive':activeSource==='sqlserver'?'SQL Server':activeSource==='postgresql'?'PostgreSQL':'Data Source')}</h2>
        {(['google_sheets','sharepoint','onedrive','rest','odata','graphql'].includes(activeSource))?<>
          <p>Paste a shared/export/direct-download URL.</p>
          <input className="inputGlass" value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://..."/>
          <button className="btnGlass primary" onClick={importCloud} disabled={busy||!url}><UploadCloud size={14}/>Import / Refresh</button>
        </>:<>
          <p>Configure this source through Admin → Connections.</p>
          <div className="connectorPlaceholderGlass"><Database size={28}/><b>Enterprise connection</b><span>{connectorCatalog.find((c:any)=>c.id===activeSource)?.mode||'DirectQuery / Import'}</span></div>
        </>}
      </div>
    </div>}
  </div>
 </div>

}
