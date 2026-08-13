import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import GridLayout,{Layout} from 'react-grid-layout';
import {
  Plus,Trash2,Copy,Filter,BarChart3,LineChart,Table2,Gauge,PanelRight,Type,Palette,Hash,Settings2,
  Layers3,Sparkles,ChevronLeft,ChevronRight,Eraser,Heading1,PaintBucket,ArrowUpDown,SlidersHorizontal,Image as ImageIcon,Upload,RotateCcw,MoreHorizontal,Download,ArrowUpAZ,ArrowDownAZ,PanelLeftClose,PanelLeftOpen,Move,Maximize2,GitBranch,ArrowDownCircle,ArrowUpCircle,MessageSquareText,Eye,FileJson,FileSpreadsheet,Clipboard,LayoutDashboard,TextCursorInput,MousePointerClick,Navigation,EyeOff,CalendarDays
} from 'lucide-react';
import Chart from '../components/Chart';
import {useStudio} from '../store';
import {api} from '../api';
import {CURRENCIES,DEFAULT_NUMBER_FORMAT} from '../formatting';
import type {NumberFormat,Page,PageSettings,Visual,VisualFilter,VisualFormat,VisualType} from '../types';

const visualTypes:VisualType[]=['textbox','button','kpi','card','multirowcard','bar','column','stackedbar','stackedcolumn','line','area','combo','pie','donut','treemap','funnel','waterfall','scatter','bubble','radar','heatmap','histogram','boxplot','gauge','progress','table','matrix','slicer'];
const visualLabels:Record<string,string>={
 kpi:'KPI',card:'Card',multirowcard:'Multi Card',bar:'Bar',column:'Column',stackedbar:'Stacked Bar',
 stackedcolumn:'Stacked Col',line:'Line',area:'Area',combo:'Combo',pie:'Pie',donut:'Donut',
 treemap:'Treemap',funnel:'Funnel',waterfall:'Waterfall',scatter:'Scatter',bubble:'Bubble',
 radar:'Radar',heatmap:'Heatmap',histogram:'Histogram',boxplot:'Box Plot',gauge:'Gauge',
 progress:'Progress',table:'Table',matrix:'Matrix',slicer:'Slicer',textbox:'Text Box',button:'Button'
};
const visualColor:Record<string,string>={
 kpi:'#f59e0b',card:'#fb7185',multirowcard:'#f472b6',bar:'#38bdf8',column:'#22d3ee',stackedbar:'#0ea5e9',
 stackedcolumn:'#06b6d4',line:'#34d399',area:'#10b981',combo:'#a78bfa',pie:'#f97316',donut:'#fb923c',
 treemap:'#84cc16',funnel:'#eab308',waterfall:'#14b8a6',scatter:'#8b5cf6',bubble:'#c084fc',
 radar:'#6366f1',heatmap:'#ef4444',histogram:'#64748b',boxplot:'#94a3b8',gauge:'#22c55e',
 progress:'#2dd4bf',table:'#60a5fa',matrix:'#818cf8',slicer:'#f43f5e',textbox:'#334155',button:'#2563eb'
};
let reportFieldDragPayload='';
let reportFieldDragCleanup:(()=>void)|undefined;
let reportFieldDragGhost:HTMLDivElement|undefined;
let reportFieldLastDropRaw='';
let reportFieldLastDropAt=0;
const clearReportFieldDragPayload=()=>window.setTimeout(()=>{reportFieldDragPayload=''},250);
const reportFieldDragLabel=(payload:string)=>payload.split(':').slice(1).join(':').split('.').slice(-1)[0]||payload;
const moveReportFieldDragGhost=(x:number,y:number)=>{if(reportFieldDragGhost)reportFieldDragGhost.style.transform=`translate(${x+14}px,${y+14}px)`};
const endReportFieldDragVisual=()=>{reportFieldDragGhost?.remove();reportFieldDragGhost=undefined;document.body.classList.remove('reportFieldDragging')};
const finishReportFieldPointerDrop=(e:PointerEvent|MouseEvent)=>{
  if(!reportFieldDragPayload)return;
  const target=(document.elementFromPoint(e.clientX,e.clientY) as HTMLElement|null)?.closest('[data-report-field-drop="true"]');
  if(!target)return;
  e.preventDefault();e.stopPropagation();
  target.dispatchEvent(new CustomEvent('vtab-report-field-drop',{bubbles:true,detail:{raw:reportFieldDragPayload}}));
};
const beginReportFieldDrag=(payload:string,e?:{clientX:number;clientY:number;preventDefault?:()=>void;stopPropagation?:()=>void})=>{
  reportFieldDragPayload=payload;
  if(typeof window==='undefined')return;
  e?.preventDefault?.();e?.stopPropagation?.();reportFieldDragCleanup?.();endReportFieldDragVisual();
  reportFieldDragGhost=document.createElement('div');reportFieldDragGhost.className='reportFieldDragGhost';reportFieldDragGhost.textContent=reportFieldDragLabel(payload);document.body.appendChild(reportFieldDragGhost);document.body.classList.add('reportFieldDragging');moveReportFieldDragGhost(e?.clientX??0,e?.clientY??0);
  const move=(ev:PointerEvent|MouseEvent)=>moveReportFieldDragGhost(ev.clientX,ev.clientY);
  const finish=(ev:PointerEvent|MouseEvent)=>{finishReportFieldPointerDrop(ev);reportFieldDragCleanup?.();clearReportFieldDragPayload()};
  window.addEventListener('pointermove',move,true);window.addEventListener('mousemove',move,true);window.addEventListener('pointerup',finish,true);window.addEventListener('mouseup',finish,true);
  reportFieldDragCleanup=()=>{window.removeEventListener('pointermove',move,true);window.removeEventListener('mousemove',move,true);window.removeEventListener('pointerup',finish,true);window.removeEventListener('mouseup',finish,true);endReportFieldDragVisual();reportFieldDragCleanup=undefined};
};
const visualIcon=(t:VisualType)=>{
 const common={viewBox:'0 0 32 32',width:20,height:20,fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
 const Bars=()=> <svg {...common}><path d="M6 25V16M13 25V9M20 25V13M27 25V5"/></svg>;
 const HBars=()=> <svg {...common}><path d="M5 8h16M5 15h22M5 22h12"/></svg>;
 const Line=()=> <svg {...common}><path d="M4 24l7-8 6 4 10-13"/><circle cx="11" cy="16" r="1.6"/><circle cx="17" cy="20" r="1.6"/><circle cx="27" cy="7" r="1.6"/></svg>;
 const Pie=()=> <svg {...common}><path d="M16 4a12 12 0 1 0 12 12H16V4z"/><path d="M20 4.7A12 12 0 0 1 27.3 12H20V4.7z"/></svg>;
 const Grid=()=> <svg {...common}><rect x="5" y="6" width="22" height="20" rx="2"/><path d="M5 12h22M5 18h22M12 6v20M20 6v20"/></svg>;
 const Scatter=()=> <svg {...common}><path d="M5 26V6M5 26h22"/><circle cx="11" cy="19" r="2"/><circle cx="17" cy="12" r="2.5"/><circle cx="24" cy="17" r="1.8"/><circle cx="22" cy="8" r="1.5"/></svg>;
 const GaugeIcon=()=> <svg {...common}><path d="M6 23a11 11 0 0 1 20 0"/><path d="M16 20l6-7"/><circle cx="16" cy="20" r="2"/></svg>;
 const FunnelIcon=()=> <svg {...common}><path d="M5 6h22l-8 9v8l-6 3V15L5 6z"/></svg>;
 const CardIcon=()=> <svg {...common}><rect x="5" y="7" width="22" height="18" rx="3"/><path d="M9 12h8M9 17h14M9 21h10"/></svg>;
 const Heat=()=> <svg {...common}>{[7,14,21].flatMap((x,i)=>[7,14,21].map((y,j)=><rect key={`${i}-${j}`} x={x} y={y} width="5" height="5" rx="1" opacity={(i+j+2)/6}/>))}</svg>;
 let icon:any=<Bars/>;
 if(['bar','stackedbar'].includes(t))icon=<HBars/>;
 else if(['line','area','combo','radar'].includes(t))icon=<Line/>;
 else if(['pie','donut'].includes(t))icon=<Pie/>;
 else if(['table','matrix','treemap'].includes(t))icon=<Grid/>;
 else if(['scatter','bubble','boxplot'].includes(t))icon=<Scatter/>;
 else if(['gauge','progress'].includes(t))icon=<GaugeIcon/>;
 else if(t==='funnel')icon=<FunnelIcon/>;
 else if(t==='textbox')icon=<TextCursorInput size={20}/>;
 else if(t==='button')icon=<MousePointerClick size={20}/>;
 else if(['kpi','card','multirowcard','slicer'].includes(t))icon=<CardIcon/>;
 else if(t==='heatmap')icon=<Heat/>;
 return <span className="visualGlyph professionalVisualGlyph" style={{'--visual-color':visualColor[t]||'#2563eb'} as any}>{icon}</span>;
}

const defaultPageSettings=():PageSettings=>({
  background:'#f3f6fa',
  showNavigation:true,
  themeId:'light-professional',
  backgroundImageFit:'cover',
  backgroundImageOpacity:24,
  pageWidth:1920,
  pageHeight:1080,
  pageSizePreset:'Full HD 16:9',
  pageAlignment:'center',
  showGrid:true,
  snapToGrid:true,
  allowOverlap:false,
  autoFitHeight:true,
  footerGap:96,
  navigationPosition:'outside',
  navigationTopMargin:16,
  navigationBottomMargin:24,
  header:{
    visible:true,
    title:'Dashboard Title',
    subtitle:'Add a subtitle or reporting period',
    fontSize:28,
    subtitleFontSize:12,
    titleColor:'#0f172a',
    subtitleColor:'#475569',
    alignment:'left',
    background:'#ffffff',
    height:84,
    paddingTop:12,
    paddingBottom:12,
    paddingLeft:24,
    paddingRight:24,
    borderRadius:14,
    showGeneratedInfo:true,
    generatedInfoBackground:'#f8fbff'
  }
});

const REPORT_THEMES=[
  {id:'vtab-midnight',name:'VTAB Midnight',preview:['#081321','#0d1d2d','#22d3ee','#8b5cf6'],page:'#081321',header:'#0b1725',visual:'#0d1724',accent:'#22d3ee',title:'#f1f7ff',label:'#cbd5e1'},
  {id:'executive-blue',name:'Executive Blue',preview:['#07152b','#102a56','#3b82f6','#60a5fa'],page:'#07152b',header:'#0b2145',visual:'#0d2345',accent:'#60a5fa',title:'#eff6ff',label:'#dbeafe'},
  {id:'graphite',name:'Graphite',preview:['#101317','#1c2128','#a3e635','#64748b'],page:'#101317',header:'#171b21',visual:'#1a2027',accent:'#a3e635',title:'#f8fafc',label:'#cbd5e1'},
  {id:'emerald',name:'Emerald Intelligence',preview:['#061a18','#0b2b28','#34d399','#14b8a6'],page:'#061a18',header:'#09231f',visual:'#0b2523',accent:'#34d399',title:'#ecfdf5',label:'#d1fae5'},
  {id:'violet',name:'Violet AI',preview:['#120a25','#241247','#a78bfa','#ec4899'],page:'#120a25',header:'#1d1037',visual:'#20143a',accent:'#a78bfa',title:'#faf5ff',label:'#ede9fe'},
  {id:'light-professional',name:'Light Professional',preview:['#f5f7fb','#ffffff','#2563eb','#0f172a'],page:'#eef2f7',header:'#ffffff',visual:'#ffffff',accent:'#2563eb',title:'#0f172a',label:'#334155'}
];
function applyThemeToPage(page:Page,themeId:string){
  // IMPORTANT: do not call pageDefaults() here. pageDefaults may itself migrate
  // an older theme via applyThemeToPage(), which would recurse indefinitely.
  page.filters=page.filters||[];
  page.settings=page.settings||defaultPageSettings();
  page.settings.header=page.settings.header||defaultPageSettings().header;
  const theme=REPORT_THEMES.find(t=>t.id===themeId)||REPORT_THEMES[0];
  page.settings!.themeId=theme.id;
  page.settings!.background=theme.page;
  page.settings!.header.background=theme.header;
  page.settings!.header.titleColor=theme.title;
  page.settings!.header.subtitleColor=theme.label;
  for(const visual of page.visuals){
    formatDefaults(visual);
    visual.format.background=theme.visual;
    visual.format.accent=theme.accent;
    visual.format.titleColor=theme.title;
    visual.format.labelColor=theme.label;
    visual.format.borderColor=theme.id==='light-professional'?'#d8e0ea':'#23394f';
  }
}
function uploadBackgroundImage(file:File,done:(dataUrl:string)=>void){
  const maxBytes=8*1024*1024;
  if(file.size>maxBytes){window.alert('Please choose an image smaller than 8 MB.');return}
  if(!file.type.startsWith('image/')){window.alert('Please choose a PNG, JPG, WEBP or other image file.');return}
  const reader=new FileReader();
  reader.onload=()=>done(String(reader.result||''));
  reader.readAsDataURL(file);
}

function pageDefaults(page:Page){
  page.filters=page.filters||[];
  page.settings=page.settings||defaultPageSettings();
  page.settings.header=page.settings.header||defaultPageSettings().header;
  page.settings.themeId=page.settings.themeId||'light-professional';
  // One-time safe migration for older empty report pages. Do the assignment
  // directly rather than calling applyThemeToPage() from inside pageDefaults().
  if(page.settings.themeId==='vtab-midnight'&&!(page.visuals||[]).length){
    const theme=REPORT_THEMES.find(t=>t.id==='light-professional')!;
    page.settings.themeId=theme.id;
    page.settings.background=theme.page;
    page.settings.header.background=theme.header;
    page.settings.header.titleColor=theme.title;
    page.settings.header.subtitleColor=theme.label;
  }
  page.settings.backgroundImageFit=page.settings.backgroundImageFit||'cover';
  page.settings.backgroundImageOpacity=page.settings.backgroundImageOpacity??24;
  page.settings.pageWidth=page.settings.pageWidth||1920;
  page.settings.pageHeight=page.settings.pageHeight||1080;
  if((page.settings.pageSizePreset as any)==='16:9')page.settings.pageSizePreset='Full HD 16:9';
  page.settings.pageSizePreset=page.settings.pageSizePreset||'Full HD 16:9';
  page.settings.pageAlignment=page.settings.pageAlignment||'center';
  page.settings.showGrid=page.settings.showGrid!==false;
  page.settings.snapToGrid=page.settings.snapToGrid!==false;
  page.settings.allowOverlap=page.settings.allowOverlap===true;
  page.settings.autoFitHeight=page.settings.autoFitHeight===true;
  page.settings.footerGap=page.settings.footerGap??96;
  page.settings.navigationPosition=page.settings.navigationPosition||'outside';
  page.settings.navigationTopMargin=page.settings.navigationTopMargin??16;
  page.settings.navigationBottomMargin=page.settings.navigationBottomMargin??24;
  page.settings.header.subtitleFontSize=page.settings.header.subtitleFontSize??12;
  page.settings.header.height=page.settings.header.height??84;
  page.settings.header.paddingTop=page.settings.header.paddingTop??12;
  page.settings.header.paddingBottom=page.settings.header.paddingBottom??12;
  page.settings.header.paddingLeft=page.settings.header.paddingLeft??24;
  page.settings.header.paddingRight=page.settings.header.paddingRight??24;
  page.settings.header.borderRadius=page.settings.header.borderRadius??14;
  page.settings.header.showGeneratedInfo=page.settings.header.showGeneratedInfo!==false;
  page.settings.header.generatedInfoBackground=page.settings.header.generatedInfoBackground||'#f8fbff';
  return page;
}
function formatDefaults(v:Visual){
  v.format=v.format||({} as VisualFormat);
  v.format.accent=v.format.accent||'#22d3ee';v.format.fontSize=v.format.fontSize||13;
  if(v.format.showTitle===undefined)v.format.showTitle=true;if(v.format.dataLabels===undefined)v.format.dataLabels=false;
  v.format.background=v.format.background||'#ffffff';v.format.fontFamily=v.format.fontFamily||'Aptos';v.format.fieldFormats=v.format.fieldFormats||{};
  v.format.titleFontSize=v.format.titleFontSize||14;v.format.titleColor=v.format.titleColor||'#0f172a';v.format.titleFontWeight=v.format.titleFontWeight||700;v.format.subtitle=v.format.subtitle||'';if(v.format.subtitleVisible===undefined)v.format.subtitleVisible=false;v.format.subtitleColor=v.format.subtitleColor||'#475569';v.format.subtitleFontSize=v.format.subtitleFontSize||11;
  v.format.labelFontSize=v.format.labelFontSize||12;v.format.labelColor=v.format.labelColor||'#1f2937';v.format.labelPosition=v.format.labelPosition||'top';
  v.format.axisFontSize=v.format.axisFontSize||11;v.format.axisColor=v.format.axisColor||'#475569';if(v.format.axisTitleVisible===undefined)v.format.axisTitleVisible=false;v.format.markerShape=v.format.markerShape||'circle';v.format.lineWidth=v.format.lineWidth||3;if(v.format.smoothLines===undefined)v.format.smoothLines=true;v.format.barRadius=v.format.barRadius??6;v.format.barWidth=v.format.barWidth||38;v.format.padding=v.format.padding??8;v.format.chartOpacity=v.format.chartOpacity??100;if(v.format.legendVisible===undefined)v.format.legendVisible=true;v.format.legendPosition=v.format.legendPosition||'bottom';
  if(v.format.borderVisible===undefined)v.format.borderVisible=true;v.format.borderColor=v.format.borderColor||'#d5dee8';v.format.borderWidth=v.format.borderWidth??1;v.format.borderStyle=v.format.borderStyle||'solid';v.format.borderEdges=v.format.borderEdges||{top:true,right:true,bottom:true,left:true};v.format.cornerRadius=v.format.cornerRadius??12;v.format.cornerLinked=v.format.cornerLinked!==false;v.format.cornerRadii=v.format.cornerRadii||{topLeft:v.format.cornerRadius,topRight:v.format.cornerRadius,bottomRight:v.format.cornerRadius,bottomLeft:v.format.cornerRadius};
  if(v.format.shadow===undefined)v.format.shadow=true;v.format.backgroundTransparency=v.format.backgroundTransparency??0;if(v.format.gridLines===undefined)v.format.gridLines=true;
  if(v.format.showDataPoints===undefined)v.format.showDataPoints=true;v.format.dataPointSize=v.format.dataPointSize||7;if(v.format.tooltipEnabled===undefined)v.format.tooltipEnabled=true;v.format.tooltipBackground=v.format.tooltipBackground||'#0a1421';v.format.tooltipColor=v.format.tooltipColor||'#dce8f5';
  if(v.format.indicatorEnabled===undefined)v.format.indicatorEnabled=false;v.format.favorableDirection=v.format.favorableDirection||'up';
  v.format.positiveColor=v.format.positiveColor||'#34d399';v.format.negativeColor=v.format.negativeColor||'#fb7185';v.format.neutralColor=v.format.neutralColor||'#94a3b8';
  return v;
}
async function queryVisual(v:Visual,roleId?:string|null,extraFilters:VisualFilter[]=[]){
  const measures=v.type==='slicer'?[]:[...(v.bindings.values||[]),...(v.bindings.target||[]),...(v.bindings.tooltips||[])];
  const dimensions=[...(v.bindings.axis||[]),...(v.bindings.legend||[])];
  return api<any>('/query',{method:'POST',body:JSON.stringify({dimensions,measures,filters:[...(v.filters||[]),...extraFilters],sort:v.sort||[],limit:(v.type==='table'||v.type==='matrix')?500:(v.type==='histogram'?5000:500),roleId})});
}

function downloadCsv(rows:any[],title:string){
  if(!rows.length){window.alert('No data is available to export.');return}
  const cols=Object.keys(rows[0]);
  const esc=(x:any)=>`"${String(x??'').replace(/"/g,'""')}"`;
  const csv=[cols.map(esc).join(','),...rows.map(row=>cols.map(c=>esc(row[c])).join(','))].join('\r\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=(title||'visual-data').replace(/[^\w\-]+/g,'_')+'.csv';
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}



function downloadJson(rows:any[],title:string){const blob=new Blob([JSON.stringify(rows,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(title||'visual-data').replace(/[^\w\-]+/g,'_')+'.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}
function downloadExcel(rows:any[],title:string){if(!rows.length){window.alert('No data is available to export.');return}const cols=Object.keys(rows[0]);const esc=(x:any)=>String(x??'').replace(/\t/g,' ').replace(/\r?\n/g,' ');const tsv=[cols.join('\t'),...rows.map(r=>cols.map(c=>esc(r[c])).join('\t'))].join('\r\n');const blob=new Blob([tsv],{type:'application/vnd.ms-excel;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(title||'visual-data').replace(/[^\w\-]+/g,'_')+'.xls';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url)}

function VisualCard({v,onSelect,selected,roleId,extraFilters,onSlicer,onChange,onDuplicate,onAction,model}:{v:Visual,onSelect:()=>void,selected:boolean,roleId?:string|null,extraFilters:VisualFilter[],onSlicer:(f:VisualFilter|null)=>void,onChange:(fn:(v:Visual)=>void)=>void,onDuplicate:()=>void,onAction:(v:Visual)=>void,model:any}){
  const[rows,setRows]=useState<any[]>([]),[err,setErr]=useState(''),[menu,setMenu]=useState(false),[focus,setFocus]=useState(false),[showData,setShowData]=useState(false);formatDefaults(v);
  useEffect(()=>{if(v.type==='textbox'||v.type==='button'){setRows([]);setErr('');return}if(v.type!=='slicer'&&!(v.bindings.values||[]).length){setRows([]);return}if(v.type==='slicer'&&!(v.bindings.axis||[]).length){setRows([]);return}
    queryVisual(v,roleId,extraFilters).then(r=>{setRows(r.rows);setErr('')}).catch(e=>setErr(e.message));
  },[JSON.stringify(v.bindings),JSON.stringify(v.filters),JSON.stringify(v.sort),JSON.stringify(extraFilters),v.type,roleId]);
  const bg=v.format.background||'#0d1724', trans=Math.max(0,Math.min(100,v.format.backgroundTransparency||0));
  const edges=v.format.borderEdges||{top:true,right:true,bottom:true,left:true};
  const border=`${v.format.borderWidth||1}px ${v.format.borderStyle||'solid'} ${v.format.borderColor||'#1f334a'}`;
  const style:any={
    border:'0',borderTop:edges.top?border:'0',borderRight:edges.right?border:'0',borderBottom:edges.bottom?border:'0',borderLeft:edges.left?border:'0',
    background:`color-mix(in srgb, ${bg} ${100-trans}%, transparent)`,padding:0,fontFamily:`${v.format.fontFamily||'Aptos'}, 'Segoe UI Variable', 'Segoe UI', sans-serif`,borderRadius:`${v.format.cornerRadii?.topLeft??v.format.cornerRadius??12}px ${v.format.cornerRadii?.topRight??v.format.cornerRadius??12}px ${v.format.cornerRadii?.bottomRight??v.format.cornerRadius??12}px ${v.format.cornerRadii?.bottomLeft??v.format.cornerRadius??12}px`,boxShadow:v.format.shadow?'0 12px 32px rgba(15,23,42,.10), 0 2px 8px rgba(15,23,42,.05)':'none'
  };
  const axisSortField=(v.bindings.axis||[]).slice(-1)[0]||'';
  const valueSortField=v.bindings.values?.[0]||'';
  const hierarchy=(model?.hierarchies||[]).find((h:any)=>h.id===v.bindings.hierarchy?.id);
  const hierarchyLevel=v.bindings.hierarchy?.level||0;
  const drill=(dir:number)=>{if(!hierarchy)return;const level=Math.max(0,Math.min(hierarchy.levels.length-1,hierarchyLevel+dir));onChange(x=>{x.bindings.hierarchy={id:hierarchy.id,level};x.bindings.axis=hierarchy.levels.slice(0,level+1).map((z:any)=>z.field);x.sort=[]})};
  const setSort=(field:string,direction:'asc'|'desc')=>{if(field)onChange(x=>x.sort=[{field,direction}]);setMenu(false)};
  const clearFilter=()=>{onChange(x=>x.filters=[]);setMenu(false)};
  const menuNode=<div className="visualHeaderActions">
    {hierarchy&&<div className="drillControls" title={`${hierarchy.name}: ${hierarchy.levels[hierarchyLevel]?.name||''}`}>
      <button disabled={hierarchyLevel<=0} onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();drill(-1)}} title="Drill up"><ArrowUpCircle size={15}/></button>
      <button disabled={hierarchyLevel>=hierarchy.levels.length-1} onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();drill(1)}} title="Drill down"><ArrowDownCircle size={15}/></button>
      <span>{hierarchy.levels[hierarchyLevel]?.name}</span>
    </div>}
    <div className="visualMenuWrap">
    <button className="visualMenuButton" title="More options" onPointerDown={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.preventDefault();e.stopPropagation();setMenu(x=>!x)}}><MoreHorizontal size={17}/></button>
    {menu&&<div className="visualContextMenu" onPointerDown={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
      {axisSortField&&<button onClick={()=>setSort(axisSortField,'asc')}><ArrowUpAZ size={14}/>Sort category ascending</button>}
      {axisSortField&&<button onClick={()=>setSort(axisSortField,'desc')}><ArrowDownAZ size={14}/>Sort category descending</button>}
      {valueSortField&&<button onClick={()=>setSort(valueSortField,'asc')}><ArrowUpAZ size={14}/>Sort value ascending</button>}
      {valueSortField&&<button onClick={()=>setSort(valueSortField,'desc')}><ArrowDownAZ size={14}/>Sort value descending</button>}
      {!!v.sort?.length&&<button onClick={()=>{onChange(x=>x.sort=[]);setMenu(false)}}><RotateCcw size={14}/>Clear sort</button>}
      <button onClick={()=>{setFocus(true);setMenu(false)}}><Maximize2 size={14}/>Focus mode</button>
      <button onClick={()=>{setShowData(true);setMenu(false)}}><Eye size={14}/>Show underlying data</button>
      <button onClick={()=>{downloadCsv(rows,v.title);setMenu(false)}}><Download size={14}/>Export CSV</button>
      <button onClick={()=>{downloadExcel(rows,v.title);setMenu(false)}}><FileSpreadsheet size={14}/>Export Excel</button>
      <button onClick={()=>{downloadJson(rows,v.title);setMenu(false)}}><FileJson size={14}/>Export JSON</button>
      <button onClick={()=>{navigator.clipboard?.writeText(JSON.stringify(v,null,2));setMenu(false)}}><Clipboard size={14}/>Copy visual specification</button>
      <button onClick={()=>{onDuplicate();setMenu(false)}}><Copy size={14}/>Duplicate visual</button>
      <button onClick={()=>{onChange(x=>x.format.showTitle=!x.format.showTitle);setMenu(false)}}><Type size={14}/>{v.format.showTitle?'Hide':'Show'} title</button>
      <button onClick={()=>{onChange(x=>x.format.legendVisible=x.format.legendVisible===false?true:false);setMenu(false)}}><Layers3 size={14}/>{v.format.legendVisible===false?'Show':'Hide'} legend</button>
      <button onClick={()=>{onChange(x=>x.format.dataLabels=!x.format.dataLabels);setMenu(false)}}><Hash size={14}/>{v.format.dataLabels?'Hide':'Show'} data labels</button>
      <button onClick={()=>{onSlicer(null);clearFilter()}}><Eraser size={14}/>Clear selection / filter</button>
    </div>}
    </div>
  </div>;
  const designerHandle=selected&&!v.format.showTitle?<div className="visualMoveOverlay visualMoveZone"><Move size={13}/><span>Move visual</span></div>:null;
  if(v.type==='textbox')return <div onMouseDown={onSelect} className={'visualCard premiumVisualCard textBoxVisual '+(selected?'selected':'')+(v.hidden?' authorHidden':'')} style={style}>{designerHandle}{v.format.showTitle&&<div className="visualTitle visualMoveZone"><div className="visualTitleText"><span>{v.title}</span></div>{menuNode}</div>}<div className="textBoxContent" style={{fontSize:v.format.fontSize||18,color:v.format.labelColor||'#111827'}}>{v.text||'Double-click or use the properties pane to enter text.'}</div></div>;
  if(v.type==='button')return <div onMouseDown={onSelect} className={'visualCard premiumVisualCard actionButtonVisual '+(selected?'selected':'')+(v.hidden?' authorHidden':'')} style={style}>{designerHandle}{v.format.showTitle&&<div className="visualTitle visualMoveZone"><div className="visualTitleText"><span>{v.title}</span></div>{menuNode}</div>}<button className="reportActionButton" style={{background:v.format.accent||'#2563eb'}} onClick={e=>{e.stopPropagation();onAction(v)}}><MousePointerClick size={16}/>{v.buttonLabel||'Action Button'}</button><small>{v.action?.type&&v.action.type!=='none'?`Action: ${v.action.type}`:'Configure an action in Build'}</small></div>;
  if(v.type==='slicer'){const axis=v.bindings.axis?.[0];const mode=v.slicerStyle||'list';return <div onMouseDown={onSelect} className={'visualCard '+(selected?'selected':'')} style={style}>{designerHandle}<div className="visualTitle visualMoveZone" style={{fontSize:v.format.titleFontSize,color:v.format.titleColor,fontWeight:v.format.titleFontWeight}}><div className="visualTitleText"><span>{v.title}</span>{v.format.subtitleVisible&&v.format.subtitle&&<small style={{color:v.format.subtitleColor,fontSize:v.format.subtitleFontSize}}>{v.format.subtitle}</small>}</div>{menuNode}</div>{mode==='dropdown'?<select className="slicerDropdown" defaultValue="" onChange={e=>e.target.value&&onSlicer({field:axis||'',operator:'equals',value:e.target.value})}><option value="">Select…</option>{rows.map((r,i)=><option key={i} value={String(r[axis||''])}>{String(r[axis||''])}</option>)}</select>:<div className={'slicerList slicer-'+mode}>{rows.map((r,i)=><button key={i} onClick={e=>{e.stopPropagation();onSlicer({field:axis||'',operator:'equals',value:r[axis||'']})}}>{String(r[axis||''])}</button>)}</div>}</div>}
  const card=<div onMouseDown={onSelect} className={'visualCard premiumVisualCard '+(selected?'selected':'')} style={style}>{designerHandle}{v.format.showTitle&&<div className="visualTitle visualMoveZone" style={{fontSize:v.format.titleFontSize,color:v.format.titleColor,fontWeight:v.format.titleFontWeight}}><div className="visualTitleText"><span>{v.title}</span>{v.format.subtitleVisible&&v.format.subtitle&&<small style={{color:v.format.subtitleColor,fontSize:v.format.subtitleFontSize}}>{v.format.subtitle}</small>}</div>{menuNode}</div>}<div className="visualBody" style={{padding:v.format.padding}}>{err?<div className="empty compact">{err}</div>:!(v.bindings.values||[]).length?<div className="visualEmpty"><Sparkles size={20}/><b>Add data to this visual</b><span>Drag a measure to Values.</span></div>:<Chart visual={v} rows={rows} onPointClick={(field,value)=>onSlicer({field,operator:'equals',value})}/>}</div></div>;
  const overlay=(focus||showData)&&createPortal(<div className="visualFocusBackdrop" onMouseDown={()=>{setFocus(false);setShowData(false)}}><div className="visualFocusPanel" onMouseDown={e=>e.stopPropagation()}><div className="visualFocusHeader"><div><small>{showData?'UNDERLYING DATA':'FOCUS MODE'}</small><b>{v.title}</b></div><button onClick={()=>{setFocus(false);setShowData(false)}}>Close</button></div><div className="visualFocusBody">{showData?<div className="underlyingDataTable"><table><thead><tr>{rows.length&&Object.keys(rows[0]).map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{rows.slice(0,500).map((r,i)=><tr key={i}>{Object.keys(r).map(c=><td key={c}>{String(r[c]??'')}</td>)}</tr>)}</tbody></table></div>:<Chart visual={v} rows={rows} onPointClick={(field,value)=>onSlicer({field,operator:'equals',value})}/>}</div></div></div>,document.body);
  return <>{card}{overlay}</>;
}

function Fields({project}:{project:any}){
  const[search,setSearch]=useState('');const start=(e:any,payload:string)=>beginReportFieldDrag(payload,e);
  const hierarchies=project.model.hierarchies||[];
  const isNumericCol=(t:string,c:string)=>{
    const typ=project.model.columnTypes?.[`${t}.${c}`];
    return typ==='number'||typ==='numeric'||/(amount|revenue|cost|qty|quantity|price|points|number|count|total|salary|age|score|rate|percent|ratio|value|weight|height|budget|spend|profit|loss|sales|units|days)/i.test(c);
  };
  return <div className="fieldsPane advancedFields"><div className="paneTitle"><span>Data</span><small>{Object.keys(project.model.tables).length} tables</small></div><input className="fieldSearch" placeholder="Search data" value={search} onChange={e=>setSearch(e.target.value)}/>{Object.entries<any>(project.model.tables).map(([t,x])=><details key={t}><summary><span className="tableGlyph">T</span><b className="tableName">{t}</b></summary>{hierarchies.filter((h:any)=>h.table===t&&h.name.toLowerCase().includes(search.toLowerCase())).map((h:any)=><div onPointerDown={e=>start(e,'hierarchy:'+h.id)} onMouseDown={e=>start(e,'hierarchy:'+h.id)} className="field hierarchyField" key={h.id}><GitBranch size={13}/><div><b>{h.name}</b><small>{h.levels.map((l:any)=>l.name).join(' › ')}</small></div></div>)}{Object.keys(x.columns).filter(c=>(t+c).toLowerCase().includes(search.toLowerCase())).map(c=>{const numeric=isNumericCol(t,c);const colType=project.model.columnTypes?.[`${t}.${c}`];const isDate=colType==='date';const prefix=numeric?'numericField:':'field:';const typeLabel=isDate?'D':numeric?'#':'Aa';const cls='field'+(numeric?' numericField':'');return <div onPointerDown={e=>start(e,prefix+t+'.'+c)} onMouseDown={e=>start(e,prefix+t+'.'+c)} className={cls} key={c}><span className={'fieldType '+(isDate?'dateType':numeric?'numberType':'textType')}>{typeLabel}</span><span className="fieldName">{c}</span></div>})}</details>)}<details open><summary><span className="measureGlyph">Σ</span><b>Measures</b></summary>{Object.keys(project.model.measures).filter(m=>m.toLowerCase().includes(search.toLowerCase())).map(m=><div onPointerDown={e=>start(e,'measure:'+m)} onMouseDown={e=>start(e,'measure:'+m)} className="field measure" key={m}><span>∑</span>{m}</div>)}</details></div>;
}
function Well({title,items,onDrop,onRemove,accept}:{title:string,items:string[],onDrop:(v:string)=>void,onRemove:(v:string)=>void,accept:'field'|'measure'|'value'}){
  const ref=useRef<HTMLDivElement|null>(null);
  const hint=accept==='measure'?'measure or numeric column':accept==='value'?'measure or numeric column':'field';
  const commit=(raw:string)=>{if(!raw)return;const now=Date.now();if(reportFieldLastDropRaw===raw&&now-reportFieldLastDropAt<180)return;reportFieldLastDropRaw=raw;reportFieldLastDropAt=now;const[prefix,...rest]=raw.split(':');const payload=rest.join(':');
    if(accept==='value'&&(prefix==='measure'||prefix==='numericField'||prefix==='field'))onDrop(payload);
    else if(accept==='field'&&(prefix==='field'||prefix==='numericField'))onDrop(payload);
    else if(accept==='field'&&prefix==='hierarchy')onDrop('@@HIERARCHY@@'+payload);
    else if(accept==='field'&&prefix==='measure')onDrop(payload);
    else if(accept==='measure'&&(prefix==='measure'||prefix==='numericField'))onDrop(payload);
  };
  useEffect(()=>{const el=ref.current;if(!el)return;const handler=(e:Event)=>{commit((e as CustomEvent<{raw:string}>).detail?.raw||'')};el.addEventListener('vtab-report-field-drop',handler);return()=>el.removeEventListener('vtab-report-field-drop',handler)});
  return <div ref={ref} data-report-field-drop="true" className="well dropWell" onPointerUp={e=>{if(reportFieldDragPayload){e.preventDefault();commit(reportFieldDragPayload);clearReportFieldDragPayload()}}} onMouseUp={e=>{if(reportFieldDragPayload){e.preventDefault();commit(reportFieldDragPayload);clearReportFieldDragPayload()}}} onDragEnter={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy'}} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy'}} onDrop={e=>{e.preventDefault();commit(e.dataTransfer.getData('application/x-vtab-field')||e.dataTransfer.getData('text/plain')||reportFieldDragPayload);clearReportFieldDragPayload()}}><div className="wellLabel"><span>{title}</span><small>{items.length}</small></div>{items.map(x=><b key={x}>{x}<button onClick={()=>onRemove(x)}>×</button></b>)}{!items.length&&<em>Drop {hint} here</em>}</div>;
}
function Section({title,icon,children,open=true}:{title:string,icon?:any,children:any,open?:boolean}){return <details className="formatSection" open={open}><summary>{icon}{title}<span>⌄</span></summary><div className="formatSectionBody">{children}</div></details>}
function Toggle({label,value,onChange}:{label:string,value:boolean,onChange:(v:boolean)=>void}){return <label className="switchRow"><span>{label}</span><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/></label>}
function ColorControl({value,onChange}:{value:string,onChange:(v:string)=>void}){return <div className="colorControl"><input type="color" value={value} onChange={e=>onChange(e.target.value)}/><input value={value} onChange={e=>onChange(e.target.value)}/></div>}
function NumberFormatting({visual,updateVisual}:{visual:Visual,updateVisual:(fn:(v:Visual)=>void)=>void}){
  const fields=visual.bindings.values||[];const[field,setField]=useState(fields[0]||'');useEffect(()=>{if(!fields.includes(field))setField(fields[0]||'')},[fields.join('|')]);
  if(!fields.length)return <div className="formatHint">Add a numeric measure to Values to configure business-number formatting.</div>;
  const f: NumberFormat={...DEFAULT_NUMBER_FORMAT,...(visual.format.fieldFormats||{})[field]};
  const set=(k:keyof NumberFormat,val:any)=>updateVisual(v=>{formatDefaults(v);v.format.fieldFormats=v.format.fieldFormats||{};v.format.fieldFormats[field]={...DEFAULT_NUMBER_FORMAT,...v.format.fieldFormats[field],[k]:val}});
  return <div className="numberFormatting"><label>Field / measure<select value={field} onChange={e=>setField(e.target.value)}>{fields.map(x=><option key={x}>{x}</option>)}</select></label><div className="segmentedFormat"><button className={f.style==='number'?'active':''} onClick={()=>set('style','number')}>123</button><button className={f.style==='currency'?'active':''} onClick={()=>set('style','currency')}>$</button><button className={f.style==='percentage'?'active':''} onClick={()=>set('style','percentage')}>%</button></div>{f.style==='currency'&&<label>Currency<select value={f.currency} onChange={e=>set('currency',e.target.value)}>{CURRENCIES.map(c=><option value={c.code} key={c.code}>{c.symbol} · {c.code}</option>)}</select></label>}<div className="twoCol"><label>Decimal places<input type="number" min="0" max="8" value={f.decimals} onChange={e=>set('decimals',+e.target.value)}/></label><label>Display units<select value={f.displayUnits} onChange={e=>set('displayUnits',e.target.value)}><option value="auto">Auto</option><option value="none">None</option><option value="thousand">Thousands (K)</option><option value="million">Millions (M)</option><option value="billion">Billions (B)</option><option value="trillion">Trillions (T)</option></select></label></div><Toggle label="Thousands separator" value={f.thousandsSeparator!==false} onChange={x=>set('thousandsSeparator',x)}/></div>;
}
function InlineFilterBuilder({model,onAdd}:{model:any,onAdd:(f:VisualFilter)=>void}){const fields=Object.entries<any>(model?.tables||{}).flatMap(([t,x])=>Object.keys(x.columns||{}).map(c=>`${t}.${c}`));const[field,setField]=useState(fields[0]||''),[operator,setOperator]=useState('equals'),[value,setValue]=useState('');return <div className="inlineFilterBuilder"><select value={field} onChange={e=>setField(e.target.value)}>{fields.map(f=><option key={f}>{f}</option>)}</select><select value={operator} onChange={e=>setOperator(e.target.value)}><option value="equals">Equals</option><option value="not_equals">Not equal</option><option value="contains">Contains</option><option value="gt">Greater than</option><option value="gte">Greater/equal</option><option value="lt">Less than</option><option value="lte">Less/equal</option></select><input value={value} onChange={e=>setValue(e.target.value)} placeholder="Filter value"/><button onClick={()=>{if(field&&value!==''){onAdd({field,operator,value});setValue('')}}}><Plus size={12}/>Add</button></div>}
function FilterList({title,filters,onRemove,model,onAdd}:{title:string,filters:VisualFilter[],onRemove:(i:number)=>void,model:any,onAdd:(f:VisualFilter)=>void}){
  return <div className="scopeBlock"><div className="scopeHead"><b>{title}</b><span>{filters.length}</span></div><InlineFilterBuilder model={model} onAdd={onAdd}/>{filters.map((f,i)=><div className="filterBox premiumFilter" key={i}><div><b>{f.field}</b><span>{f.operator} {String(f.value)}</span></div><button onClick={()=>onRemove(i)}>×</button></div>)}{!filters.length&&<small>No filters configured.</small>}</div>;
}
function VisualizationsPane({addVisual}:{addVisual:(type:VisualType)=>void}){
  const[group,setGroup]=useState<'all'|'core'|'analysis'|'advanced'>('all');
  const core=new Set<VisualType>(['textbox','button','kpi','card','multirowcard','bar','column','stackedbar','stackedcolumn','line','area','combo','pie','donut','table','matrix','slicer']);
  const analysis=new Set<VisualType>(['treemap','funnel','waterfall','scatter','bubble','gauge','progress']);
  const advanced=new Set<VisualType>(['radar','heatmap','histogram','boxplot']);
  const items=visualTypes.filter(t=>group==='all'||(group==='core'&&core.has(t))||(group==='analysis'&&analysis.has(t))||(group==='advanced'&&advanced.has(t)));
  return <section className="visualizationsPane">
    <div className="visualizationsHeader"><div><span>VISUALIZATIONS</span><b>Add a visual</b></div><small>{visualTypes.length} available</small></div>
    <div className="visualCategoryTabs"><button className={group==='all'?'active':''} onClick={()=>setGroup('all')}>All</button><button className={group==='core'?'active':''} onClick={()=>setGroup('core')}>Core</button><button className={group==='analysis'?'active':''} onClick={()=>setGroup('analysis')}>Analysis</button><button className={group==='advanced'?'active':''} onClick={()=>setGroup('advanced')}>Advanced</button></div>
    <div className="rightVisualGallery">{items.map(type=><button type="button" key={type} onClick={e=>{e.preventDefault();e.stopPropagation();addVisual(type)}} title={`Add ${visualLabels[type]}`}>{visualIcon(type)}<span>{visualLabels[type]}</span></button>)}</div>
  </section>;
}

function RightPane({visual,updateVisual,removeVisual,duplicate,page,updatePage,reportFilters,setReportFilters,model,addVisual,galleryVisible}:{visual:Visual|undefined,updateVisual:(fn:(v:Visual)=>void)=>void,removeVisual:()=>void,duplicate:()=>void,page:Page,updatePage:(fn:(p:Page)=>void)=>void,reportFilters:VisualFilter[],setReportFilters:(x:VisualFilter[])=>void,model:any,addVisual:(type:VisualType)=>void,galleryVisible:boolean}){
  const[tab,setTab]=useState<'build'|'format'|'filters'|'page'>('build');
  const setFmt=(k:keyof VisualFormat,val:any)=>visual&&updateVisual(v=>{formatDefaults(v);(v.format as any)[k]=val});
  const addBinding=(k:'axis'|'values'|'target'|'tooltips'|'legend',x:string)=>visual&&updateVisual(v=>{
    if(k==='axis'&&x.startsWith('@@HIERARCHY@@')){const id=x.replace('@@HIERARCHY@@','');const h=(model?.hierarchies||[]).find((z:any)=>z.id===id);if(h){v.bindings.hierarchy={id,level:0};v.bindings.axis=[h.levels[0].field];return}}
    (v.bindings as any)[k]=[...((v.bindings as any)[k]||[]),x]
  });
  const removeBinding=(k:'axis'|'values'|'target'|'tooltips'|'legend',x:string)=>visual&&updateVisual(v=>{(v.bindings as any)[k]=((v.bindings as any)[k]||[]).filter((z:string)=>z!==x);if(k==='axis'&&!(v.bindings.axis||[]).length)v.bindings.hierarchy=undefined});
  const pageSettings=page.settings||defaultPageSettings();
  return <div className="formatPane advancedFormat professionalRightPane">{galleryVisible&&<VisualizationsPane addVisual={addVisual}/>}<div className="formatPaneHeader"><div><small>{visual?'VISUAL':'PAGE'}</small><b>{visual?.title||page.name}</b></div><div className="formatTabs four"><button className={tab==='build'?'active':''} onClick={()=>setTab('build')}>Build</button><button className={tab==='format'?'active':''} onClick={()=>setTab('format')}>Format</button><button className={tab==='filters'?'active':''} onClick={()=>setTab('filters')}>Filters</button><button className={tab==='page'?'active':''} onClick={()=>setTab('page')}>Page</button></div></div>
  {tab==='build'?(!visual?<div className="paneEmpty"><Layers3/><b>Select a visual</b><span>Choose a visual on the canvas to bind fields and measures.</span></div>:<div className="propertyList">{visual.type==='textbox'?<Section title="Text box" icon={<TextCursorInput size={14}/>}><label>Text<textarea rows={7} value={visual.text||''} onChange={e=>updateVisual(v=>v.text=e.target.value)} placeholder="Enter report text..."/></label></Section>:visual.type==='button'?<><Section title="Button" icon={<MousePointerClick size={14}/>}><label>Button label<input value={visual.buttonLabel||''} onChange={e=>updateVisual(v=>v.buttonLabel=e.target.value)} placeholder="Go to Details"/></label><label>Action<select value={visual.action?.type||'none'} onChange={e=>updateVisual(v=>v.action={...(v.action||{}),type:e.target.value as any})}><option value="none">No action</option><option value="navigate">Navigate to page</option><option value="toggleVisual">Show / Hide visual</option><option value="showVisual">Show visual</option><option value="hideVisual">Hide visual</option><option value="clearFilters">Clear filters</option></select></label>{visual.action?.type==='navigate'&&<label>Target page<select value={visual.action?.targetPageId||''} onChange={e=>updateVisual(v=>v.action={...(v.action||{}),targetPageId:e.target.value})}><option value="">Select page</option>{(model?.__pages||[]).map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}{['toggleVisual','showVisual','hideVisual'].includes(visual.action?.type||'')&&<label>Target visual<select value={visual.action?.targetVisualId||''} onChange={e=>updateVisual(v=>v.action={...(v.action||{}),targetVisualId:e.target.value})}><option value="">Select visual</option>{page.visuals.filter(x=>x.id!==visual.id).map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></label>}</Section></>:<Section title="Data" icon={<Layers3 size={14}/>}><Well title="Axis / Category" items={visual.bindings.axis||[]} accept="field" onDrop={x=>addBinding('axis',x)} onRemove={x=>removeBinding('axis',x)}/><Well title="Values" items={visual.bindings.values||[]} accept="value" onDrop={x=>addBinding('values',x)} onRemove={x=>removeBinding('values',x)}/><Well title="Legend / Series" items={visual.bindings.legend||[]} accept="field" onDrop={x=>addBinding('legend',x)} onRemove={x=>removeBinding('legend',x)}/><Well title="Tooltips" items={visual.bindings.tooltips||[]} accept="value" onDrop={x=>addBinding('tooltips',x)} onRemove={x=>removeBinding('tooltips',x)}/>{visual.type==='kpi'&&<Well title="Comparison / Target" items={visual.bindings.target||[]} accept="value" onDrop={x=>addBinding('target',x)} onRemove={x=>removeBinding('target',x)}/>}</Section>}{visual.type==='slicer'&&<Section title="Slicer layout" icon={<Filter size={14}/>}><label>Style<select value={visual.slicerStyle||'list'} onChange={e=>updateVisual(v=>v.slicerStyle=e.target.value as any)}><option value="list">List</option><option value="dropdown">Dropdown</option><option value="verticalTiles">Vertical tiles</option><option value="horizontalTiles">Horizontal tiles</option></select></label></Section>}<div className="visualActions"><button onClick={duplicate}><Copy size={14}/>Duplicate</button><button className="dangerBtn" onClick={removeVisual}><Trash2 size={14}/>Delete</button></div></div>)
  :tab==='format'?(!visual?<div className="paneEmpty"><Palette/><b>Select a visual</b><span>Visual formatting appears here.</span></div>:<div className="propertyList"><div className="formatSearch">⌕ Search format settings</div><Section title="Premium visual style" icon={<Sparkles size={14}/>}><div className="premiumPresetGrid"><button onClick={()=>updateVisual(v=>{formatDefaults(v);Object.assign(v.format,{background:'#ffffff',borderColor:'#e2e8f0',cornerRadius:16,cornerLinked:true,cornerRadii:{topLeft:16,topRight:16,bottomRight:16,bottomLeft:16},shadow:true,titleColor:'#0f172a',labelColor:'#334155',axisColor:'#64748b',gridLines:true,barRadius:10})})}>Executive</button><button onClick={()=>updateVisual(v=>{formatDefaults(v);Object.assign(v.format,{background:'#ffffff',borderColor:'#eef2f7',cornerRadius:12,cornerLinked:true,cornerRadii:{topLeft:12,topRight:12,bottomRight:12,bottomLeft:12},shadow:false,titleColor:'#111827',labelColor:'#475569',axisColor:'#64748b',gridLines:false,barRadius:6})})}>Clean</button><button onClick={()=>updateVisual(v=>{formatDefaults(v);Object.assign(v.format,{background:'#ffffff',borderColor:'#dbeafe',cornerRadius:18,cornerLinked:true,cornerRadii:{topLeft:18,topRight:18,bottomRight:18,bottomLeft:18},shadow:true,titleColor:'#0f172a',labelColor:'#1f2937',axisColor:'#475569',gridLines:true,barRadius:12})})}>Elevated</button></div><div className="formatHint">Applies a polished container, typography, axis and spacing preset. Fine-tune individual settings below.</div></Section><Section title="Number / amount formatting" icon={<Hash size={14}/>}><NumberFormatting visual={visual} updateVisual={updateVisual}/></Section><Section title="Title & subtitle" icon={<Type size={14}/>}><Toggle label="Show title" value={visual.format.showTitle} onChange={x=>setFmt('showTitle',x)}/><label>Title text<input value={visual.title} onChange={e=>updateVisual(v=>v.title=e.target.value)}/></label><div className="twoCol"><label>Font size<input type="number" min="8" max="48" value={visual.format.titleFontSize} onChange={e=>setFmt('titleFontSize',+e.target.value)}/></label><label>Weight<select value={visual.format.titleFontWeight||700} onChange={e=>setFmt('titleFontWeight',+e.target.value)}><option value="400">Regular</option><option value="500">Medium</option><option value="600">Semi Bold</option><option value="700">Bold</option><option value="800">Extra Bold</option></select></label></div><label>Title color<ColorControl value={visual.format.titleColor||'#0f172a'} onChange={x=>setFmt('titleColor',x)}/></label><Toggle label="Show subtitle" value={!!visual.format.subtitleVisible} onChange={x=>setFmt('subtitleVisible',x)}/>{visual.format.subtitleVisible&&<><label>Subtitle<input value={visual.format.subtitle||''} onChange={e=>setFmt('subtitle',e.target.value)}/></label><div className="twoCol"><label>Subtitle size<input type="number" min="7" max="24" value={visual.format.subtitleFontSize||9} onChange={e=>setFmt('subtitleFontSize',+e.target.value)}/></label><label>Subtitle color<ColorControl value={visual.format.subtitleColor||'#475569'} onChange={x=>setFmt('subtitleColor',x)}/></label></div></>}</Section><Section title="Data labels & points" icon={<SlidersHorizontal size={14}/>}><Toggle label="Show data labels" value={visual.format.dataLabels} onChange={x=>setFmt('dataLabels',x)}/><Toggle label="Show data points" value={visual.format.showDataPoints!==false} onChange={x=>setFmt('showDataPoints',x)}/><label>Point size<input type="range" min="2" max="18" value={visual.format.dataPointSize||7} onChange={e=>setFmt('dataPointSize',+e.target.value)}/></label><div className="twoCol"><label>Label size<input type="number" min="8" max="36" value={visual.format.labelFontSize} onChange={e=>setFmt('labelFontSize',+e.target.value)}/></label><label>Position<select value={visual.format.labelPosition} onChange={e=>setFmt('labelPosition',e.target.value)}><option value="top">Outside / Top</option><option value="inside">Inside</option><option value="outside">Outside</option></select></label></div></Section>{visual.type==='kpi'&&<Section title="Up / Down indicator" icon={<ArrowUpDown size={14}/>}><Toggle label="Show indicator arrow" value={!!visual.format.indicatorEnabled} onChange={x=>setFmt('indicatorEnabled',x)}/><label>Good direction<select value={visual.format.favorableDirection||'up'} onChange={e=>setFmt('favorableDirection',e.target.value)}><option value="up">Higher is better ↑</option><option value="down">Lower is better ↓</option></select></label><label>Positive color<ColorControl value={visual.format.positiveColor||'#34d399'} onChange={x=>setFmt('positiveColor',x)}/></label><label>Negative color<ColorControl value={visual.format.negativeColor||'#fb7185'} onChange={x=>setFmt('negativeColor',x)}/></label><div className="formatHint">Add a second measure in <b>Comparison / Target</b>. The KPI compares the primary value to that measure and renders ↑, ↓ or →.</div></Section>}<Section title="Tooltips" icon={<MessageSquareText size={14}/>}><Toggle label="Show tooltips" value={visual.format.tooltipEnabled!==false} onChange={x=>setFmt('tooltipEnabled',x)}/><label>Tooltip background<ColorControl value={visual.format.tooltipBackground||'#0a1421'} onChange={x=>setFmt('tooltipBackground',x)}/></label><label>Tooltip text<ColorControl value={visual.format.tooltipColor||'#dce8f5'} onChange={x=>setFmt('tooltipColor',x)}/></label><div className="formatHint">Drag extra measures to the <b>Tooltips</b> field well to show them without changing the chart axis.</div></Section><Section title="Data colors" icon={<Palette size={14}/>}><label>Primary series color<ColorControl value={visual.format.accent} onChange={x=>setFmt('accent',x)}/></label></Section><Section title="Legend & axes" icon={<Settings2 size={14}/>}><Toggle label="Show legend" value={visual.format.legendVisible!==false} onChange={x=>setFmt('legendVisible',x)}/><label>Legend position<select value={visual.format.legendPosition||'bottom'} onChange={e=>setFmt('legendPosition',e.target.value)}><option value="top">Top</option><option value="bottom">Bottom</option><option value="left">Left</option><option value="right">Right</option></select></label><Toggle label="Grid lines" value={visual.format.gridLines!==false} onChange={x=>setFmt('gridLines',x)}/></Section><Section title="Chart appearance" icon={<Sparkles size={14}/>}>
<div className="twoCol"><label>Axis text size<input type="number" min="7" max="24" value={visual.format.axisFontSize||10} onChange={e=>setFmt('axisFontSize',+e.target.value)}/></label><label>Line width<input type="number" min="1" max="10" value={visual.format.lineWidth||3} onChange={e=>setFmt('lineWidth',+e.target.value)}/></label></div>
<label>Axis / tick color<ColorControl value={visual.format.axisColor||'#475569'} onChange={x=>setFmt('axisColor',x)}/></label>
<div className="twoCol"><label>Bar radius<input type="number" min="0" max="30" value={visual.format.barRadius??6} onChange={e=>setFmt('barRadius',+e.target.value)}/></label><label>Bar max width<input type="number" min="8" max="100" value={visual.format.barWidth||38} onChange={e=>setFmt('barWidth',+e.target.value)}/></label></div>
<Toggle label="Smooth lines" value={visual.format.smoothLines!==false} onChange={x=>setFmt('smoothLines',x)}/>
<label>Marker shape<select value={visual.format.markerShape||'circle'} onChange={e=>setFmt('markerShape',e.target.value)}><option value="circle">Circle</option><option value="rect">Square</option><option value="roundRect">Rounded square</option><option value="triangle">Triangle</option><option value="diamond">Diamond</option></select></label>
<div className="twoCol"><label>Inner padding<input type="number" min="0" max="40" value={visual.format.padding??8} onChange={e=>setFmt('padding',+e.target.value)}/></label><label>Chart opacity<input type="number" min="20" max="100" value={visual.format.chartOpacity??100} onChange={e=>setFmt('chartOpacity',+e.target.value)}/></label></div>
</Section>
<Section title="Position & size" icon={<Move size={14}/>}>
  <div className="placementGroup"><b>Quick placement</b><div className="placementButtons"><button title="Align to left" onClick={()=>updateVisual(v=>v.x=0)}>Left</button><button title="Center horizontally" onClick={()=>updateVisual(v=>v.x=Math.max(0,Math.round((12-v.w)/2)))}>Center</button><button title="Align to right" onClick={()=>updateVisual(v=>v.x=Math.max(0,12-v.w))}>Right</button><button title="Move to top" onClick={()=>updateVisual(v=>v.y=0)}>Top</button></div></div>
  <div className="placementGroup"><b>Nudge</b><div className="nudgePad"><span/><button title="Move up one grid row" onClick={()=>updateVisual(v=>v.y=Math.max(0,v.y-1))}>↑</button><span/><button title="Move left one grid column" onClick={()=>updateVisual(v=>v.x=Math.max(0,v.x-1))}>←</button><button title="Reset position" onClick={()=>updateVisual(v=>{v.x=0;v.y=0})}>●</button><button title="Move right one grid column" onClick={()=>updateVisual(v=>v.x=Math.min(12-v.w,v.x+1))}>→</button><span/><button title="Move down one grid row" onClick={()=>updateVisual(v=>v.y=v.y+1)}>↓</button><span/></div></div>
  <div className="twoCol"><label>Horizontal position (X)<input type="number" min="0" max={Math.max(0,12-visual.w)} value={visual.x} onChange={e=>updateVisual(v=>v.x=Math.max(0,Math.min(12-v.w,+e.target.value)))}/></label><label>Vertical position (Y)<input type="number" min="0" value={visual.y} onChange={e=>updateVisual(v=>v.y=Math.max(0,+e.target.value))}/></label></div>
  <div className="twoCol"><label>Width<input type="number" min="2" max="12" value={visual.w} onChange={e=>updateVisual(v=>{v.w=Math.max(2,Math.min(12,+e.target.value));v.x=Math.min(v.x,12-v.w)})}/></label><label>Height<input type="number" min="2" max="30" value={visual.h} onChange={e=>updateVisual(v=>v.h=Math.max(2,Math.min(30,+e.target.value)))}/></label></div>
  <div className="placementGroup"><b>Quick width</b><div className="placementButtons widthPresets"><button onClick={()=>updateVisual(v=>{v.w=3;v.x=Math.min(v.x,9)})}>¼</button><button onClick={()=>updateVisual(v=>{v.w=4;v.x=Math.min(v.x,8)})}>⅓</button><button onClick={()=>updateVisual(v=>{v.w=6;v.x=Math.min(v.x,6)})}>½</button><button onClick={()=>updateVisual(v=>{v.w=8;v.x=Math.min(v.x,4)})}>⅔</button><button onClick={()=>updateVisual(v=>{v.w=12;v.x=0})}>Full</button></div></div>
  <div className="formatHint"><b>Tip:</b> select the visual and use the visible <b>Drag</b> handle. Resize handles appear on all sides and corners. Position controls use the same 12-column report grid.</div>
</Section><Section title="Visual container" icon={<PanelRight size={14}/>}><label>Background<ColorControl value={visual.format.background||'#ffffff'} onChange={x=>setFmt('background',x)}/></label><Toggle label="Border" value={visual.format.borderVisible!==false} onChange={x=>setFmt('borderVisible',x)}/>
<label>Border color<ColorControl value={visual.format.borderColor||'#d5dee8'} onChange={x=>setFmt('borderColor',x)}/></label>
<div className="twoCol"><label>Border width<input type="number" min="0" max="8" value={visual.format.borderWidth||1} onChange={e=>setFmt('borderWidth',+e.target.value)}/></label><label>Border style<select value={visual.format.borderStyle||'solid'} onChange={e=>setFmt('borderStyle',e.target.value)}><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label></div>
<div className="edgeGrid"><Toggle label="Top edge" value={visual.format.borderEdges?.top!==false} onChange={x=>updateVisual(v=>{formatDefaults(v);v.format.borderEdges={...v.format.borderEdges,top:x}})}/><Toggle label="Right edge" value={visual.format.borderEdges?.right!==false} onChange={x=>updateVisual(v=>{formatDefaults(v);v.format.borderEdges={...v.format.borderEdges,right:x}})}/><Toggle label="Bottom edge" value={visual.format.borderEdges?.bottom!==false} onChange={x=>updateVisual(v=>{formatDefaults(v);v.format.borderEdges={...v.format.borderEdges,bottom:x}})}/><Toggle label="Left edge" value={visual.format.borderEdges?.left!==false} onChange={x=>updateVisual(v=>{formatDefaults(v);v.format.borderEdges={...v.format.borderEdges,left:x}})}/></div>
<div className="cornerEditor"><div className="cornerEditorHead"><b>Visual corners</b><Toggle label="Link all corners" value={visual.format.cornerLinked!==false} onChange={x=>updateVisual(v=>{formatDefaults(v);v.format.cornerLinked=x;if(x){const r=v.format.cornerRadii?.topLeft??v.format.cornerRadius??12;v.format.cornerRadius=r;v.format.cornerRadii={topLeft:r,topRight:r,bottomRight:r,bottomLeft:r}}})}/></div>{visual.format.cornerLinked!==false?<label>All corners<input type="range" min="0" max="48" value={visual.format.cornerRadii?.topLeft??visual.format.cornerRadius??12} onChange={e=>updateVisual(v=>{formatDefaults(v);const r=+e.target.value;v.format.cornerRadius=r;v.format.cornerRadii={topLeft:r,topRight:r,bottomRight:r,bottomLeft:r}})}/><span className="cornerValue">{visual.format.cornerRadii?.topLeft??visual.format.cornerRadius??12}px</span></label>:<div className="cornerGrid"><label>Top left<input type="number" min="0" max="48" value={visual.format.cornerRadii?.topLeft??12} onChange={e=>updateVisual(v=>{formatDefaults(v);v.format.cornerRadii={...v.format.cornerRadii,topLeft:+e.target.value}})}/></label><label>Top right<input type="number" min="0" max="48" value={visual.format.cornerRadii?.topRight??12} onChange={e=>updateVisual(v=>{formatDefaults(v);v.format.cornerRadii={...v.format.cornerRadii,topRight:+e.target.value}})}/></label><label>Bottom left<input type="number" min="0" max="48" value={visual.format.cornerRadii?.bottomLeft??12} onChange={e=>updateVisual(v=>{formatDefaults(v);v.format.cornerRadii={...v.format.cornerRadii,bottomLeft:+e.target.value}})}/></label><label>Bottom right<input type="number" min="0" max="48" value={visual.format.cornerRadii?.bottomRight??12} onChange={e=>updateVisual(v=>{formatDefaults(v);v.format.cornerRadii={...v.format.cornerRadii,bottomRight:+e.target.value}})}/></label></div>}</div><label>Font<select value={visual.format.fontFamily||'Inter'} onChange={e=>setFmt('fontFamily',e.target.value)}><option>Aptos</option><option>Segoe UI Variable</option><option>Segoe UI</option><option>Inter</option><option>Poppins</option><option>Roboto</option><option>Arial</option><option>Georgia</option></select></label></Section></div>)
  :tab==='filters'?<div className="propertyList filterScopes"><FilterList title="Filters on this visual" filters={visual?.filters||[]} model={model} onAdd={f=>visual&&updateVisual(v=>v.filters=[...(v.filters||[]),f])} onRemove={i=>visual&&updateVisual(v=>v.filters=(v.filters||[]).filter((_,j)=>j!==i))}/><FilterList title="Filters on this page" filters={page.filters||[]} model={model} onAdd={f=>updatePage(p=>p.filters=[...(p.filters||[]),f])} onRemove={i=>updatePage(p=>p.filters=(p.filters||[]).filter((_,j)=>j!==i))}/><FilterList title="Filters on all pages" filters={reportFilters} model={model} onAdd={f=>setReportFilters([...reportFilters,f])} onRemove={i=>setReportFilters(reportFilters.filter((_,j)=>j!==i))}/></div>
  :<div className="propertyList">
    <Section title="Report Theme" icon={<Palette size={14}/>}>
      <div className="themeGallery">{REPORT_THEMES.map(theme=><button key={theme.id} className={(pageSettings.themeId||'light-professional')===theme.id?'themeCard active':'themeCard'} onClick={()=>updatePage(p=>applyThemeToPage(p,theme.id))}>
        <div className="themeSwatches">{theme.preview.map((c,i)=><i key={i} style={{background:c}}/>)}</div>
        <span>{theme.name}</span>
      </button>)}</div>
      <div className="formatHint">Themes apply the page, header, visual background, accent, labels and title colors. You can still override individual visuals afterward.</div>
    </Section>
    <Section title="Background Image" icon={<ImageIcon size={14}/>}>
      <label className="uploadBackgroundBtn"><Upload size={14}/><span>Upload background image</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e=>{const file=e.target.files?.[0];if(file)uploadBackgroundImage(file,data=>updatePage(p=>{pageDefaults(p);p.settings!.backgroundImage=data}))}}/></label>
      {pageSettings.backgroundImage&&<div className="backgroundThumb" style={{backgroundImage:`url(${pageSettings.backgroundImage})`}}/>}
      <label>Image fit<select value={pageSettings.backgroundImageFit||'cover'} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.backgroundImageFit=e.target.value as any})}>
        <option value="cover">Cover</option><option value="contain">Contain</option><option value="stretch">Stretch</option><option value="center">Center</option>
      </select></label>
      <label>Image opacity <span>{pageSettings.backgroundImageOpacity??24}%</span><input type="range" min="0" max="100" value={pageSettings.backgroundImageOpacity??24} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.backgroundImageOpacity=+e.target.value})}/></label>
      <div className="inlineActions"><button onClick={()=>updatePage(p=>{pageDefaults(p);p.settings!.backgroundImage=undefined})}><Trash2 size={13}/>Remove image</button><button onClick={()=>updatePage(p=>{const fresh=defaultPageSettings();p.settings=fresh})}><RotateCcw size={13}/>Reset page</button></div>
      <div className="formatHint">PNG, JPG, WEBP or GIF up to 8 MB. The image is stored with report metadata for this authoring build.</div>
    </Section>
    <Section title="Dashboard Header" icon={<Heading1 size={14}/>}>
<Toggle label="Show header" value={pageSettings.header.visible} onChange={x=>updatePage(p=>{pageDefaults(p);p.settings!.header.visible=x})}/>
<label>Dashboard title<input value={pageSettings.header.title} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.header.title=e.target.value})}/></label>
<label>Subtitle<input value={pageSettings.header.subtitle} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.header.subtitle=e.target.value})}/></label>
<div className="headerPresetButtons"><button onClick={()=>updatePage(p=>{pageDefaults(p);Object.assign(p.settings!.header,{height:76,fontSize:26,subtitleFontSize:11,paddingTop:10,paddingBottom:10})})}>Compact</button><button onClick={()=>updatePage(p=>{pageDefaults(p);Object.assign(p.settings!.header,{height:96,fontSize:30,subtitleFontSize:12,paddingTop:14,paddingBottom:14})})}>Standard</button><button onClick={()=>updatePage(p=>{pageDefaults(p);Object.assign(p.settings!.header,{height:132,fontSize:38,subtitleFontSize:14,paddingTop:20,paddingBottom:20})})}>Large</button></div>
<label>Header height <span>{pageSettings.header.height??84}px</span><input type="range" min="60" max="220" value={pageSettings.header.height??84} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.header.height=+e.target.value})}/></label>
<div className="twoCol"><label>Title size<input type="number" min="16" max="64" value={pageSettings.header.fontSize} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.header.fontSize=+e.target.value})}/></label><label>Subtitle size<input type="number" min="9" max="28" value={pageSettings.header.subtitleFontSize??12} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.header.subtitleFontSize=+e.target.value})}/></label></div>
<label>Alignment<select value={pageSettings.header.alignment} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.header.alignment=e.target.value as any})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
<label>Header background<ColorControl value={pageSettings.header.background} onChange={x=>updatePage(p=>{pageDefaults(p);p.settings!.header.background=x})}/></label>
<div className="twoCol"><label>Title color<ColorControl value={pageSettings.header.titleColor} onChange={x=>updatePage(p=>{pageDefaults(p);p.settings!.header.titleColor=x})}/></label><label>Subtitle color<ColorControl value={pageSettings.header.subtitleColor} onChange={x=>updatePage(p=>{pageDefaults(p);p.settings!.header.subtitleColor=x})}/></label></div>
<div className="twoCol"><label>Top padding<input type="number" min="0" max="60" value={pageSettings.header.paddingTop??12} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.header.paddingTop=+e.target.value})}/></label><label>Bottom padding<input type="number" min="0" max="60" value={pageSettings.header.paddingBottom??12} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.header.paddingBottom=+e.target.value})}/></label></div>
<div className="twoCol"><label>Left padding<input type="number" min="0" max="80" value={pageSettings.header.paddingLeft??24} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.header.paddingLeft=+e.target.value})}/></label><label>Right padding<input type="number" min="0" max="80" value={pageSettings.header.paddingRight??24} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.header.paddingRight=+e.target.value})}/></label></div>
<label>Header corner radius <span>{pageSettings.header.borderRadius??14}px</span><input type="range" min="0" max="40" value={pageSettings.header.borderRadius??14} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.header.borderRadius=+e.target.value})}/></label>
<Toggle label="Show generated-date box" value={pageSettings.header.showGeneratedInfo!==false} onChange={x=>updatePage(p=>{pageDefaults(p);p.settings!.header.showGeneratedInfo=x})}/>
{pageSettings.header.showGeneratedInfo!==false&&<label>Generated-date background<ColorControl value={pageSettings.header.generatedInfoBackground||'#f8fbff'} onChange={x=>updatePage(p=>{pageDefaults(p);p.settings!.header.generatedInfoBackground=x})}/></label>}
</Section><Section title="Page size & canvas" icon={<Maximize2 size={14}/>}>
<div className="pageSizePresetCards"><button className={pageSettings.pageSizePreset==='HD 16:9'?'active':''} onClick={()=>updatePage(p=>{pageDefaults(p);p.settings!.pageSizePreset='HD 16:9';p.settings!.pageWidth=1280;p.settings!.pageHeight=720})}><b>HD</b><span>1280 × 720</span></button><button className={pageSettings.pageSizePreset==='Full HD 16:9'?'active':''} onClick={()=>updatePage(p=>{pageDefaults(p);p.settings!.pageSizePreset='Full HD 16:9';p.settings!.pageWidth=1920;p.settings!.pageHeight=1080})}><b>Full HD</b><span>1920 × 1080</span></button><button className={pageSettings.pageSizePreset==='QHD 16:9'?'active':''} onClick={()=>updatePage(p=>{pageDefaults(p);p.settings!.pageSizePreset='QHD 16:9';p.settings!.pageWidth=2560;p.settings!.pageHeight=1440})}><b>QHD</b><span>2560 × 1440</span></button><button className={pageSettings.pageSizePreset==='16:10'?'active':''} onClick={()=>updatePage(p=>{pageDefaults(p);p.settings!.pageSizePreset='16:10';p.settings!.pageWidth=1600;p.settings!.pageHeight=1000})}><b>16:10</b><span>1600 × 1000</span></button></div>
<label>More presets<select value={pageSettings.pageSizePreset||'Full HD 16:9'} onChange={e=>updatePage(p=>{pageDefaults(p);const preset=e.target.value as any;p.settings!.pageSizePreset=preset;const dims:any={'HD 16:9':[1280,720],'Full HD 16:9':[1920,1080],'QHD 16:9':[2560,1440],'16:10':[1600,1000],'4:3':[1024,768],'A4 Landscape':[1123,794],'A4 Portrait':[794,1123]};if(dims[preset]){p.settings!.pageWidth=dims[preset][0];p.settings!.pageHeight=dims[preset][1]}})}><option>HD 16:9</option><option>Full HD 16:9</option><option>QHD 16:9</option><option>16:10</option><option>4:3</option><option>A4 Landscape</option><option>A4 Portrait</option><option>Custom</option></select></label>
<div className="twoCol"><label>Width (px)<input type="number" min="640" max="4000" value={pageSettings.pageWidth||1920} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.pageWidth=+e.target.value;p.settings!.pageSizePreset='Custom'})}/></label><label>Height (px)<input type="number" min="480" max="6000" value={pageSettings.pageHeight||1080} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.pageHeight=+e.target.value;p.settings!.pageSizePreset='Custom';p.settings!.autoFitHeight=false})}/></label></div>
<div className="pageSizeActions"><button onClick={()=>updatePage(p=>{pageDefaults(p);const w=p.settings!.pageWidth||1920;p.settings!.pageWidth=p.settings!.pageHeight||1080;p.settings!.pageHeight=w;p.settings!.pageSizePreset='Custom';p.settings!.autoFitHeight=false})}>↔ Swap orientation</button><button onClick={()=>updatePage(p=>{pageDefaults(p);const headerH=p.settings!.header.visible?(p.settings!.header.height||84):0;const maxRow=(p.visuals||[]).reduce((m,v)=>Math.max(m,(v.y||0)+(v.h||2)),0);p.settings!.pageHeight=Math.max(540,Math.ceil((headerH+42+maxRow*66+(p.settings!.footerGap||96))/50)*50);p.settings!.pageSizePreset='Custom';p.settings!.autoFitHeight=true})}>↕ Fit height to visuals</button></div>
<Toggle label="Auto-fit height to visuals" value={pageSettings.autoFitHeight===true} onChange={x=>updatePage(p=>{pageDefaults(p);p.settings!.autoFitHeight=x})}/><label>Bottom content gap <span>{pageSettings.footerGap??96}px</span><input type="range" min="32" max="240" value={pageSettings.footerGap??96} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.footerGap=+e.target.value})}/></label>
<label>Page alignment<select value={pageSettings.pageAlignment||'center'} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.pageAlignment=e.target.value as any})}><option value="center">Center in workspace</option><option value="left">Align left</option></select></label>
<Toggle label="Show canvas grid" value={pageSettings.showGrid!==false} onChange={x=>updatePage(p=>{pageDefaults(p);p.settings!.showGrid=x})}/><Toggle label="Use standard grid (off = fine placement)" value={pageSettings.snapToGrid!==false} onChange={x=>updatePage(p=>{pageDefaults(p);p.settings!.snapToGrid=x})}/><Toggle label="Allow visuals to overlap" value={pageSettings.allowOverlap===true} onChange={x=>updatePage(p=>{pageDefaults(p);p.settings!.allowOverlap=x})}/><div className="formatHint">Use presets for common screens, or Custom for exact dimensions. <b>Fit height to visuals</b> removes unnecessary empty page space without moving any visual.</div>
</Section>
<Section title="Page background" icon={<PaintBucket size={14}/>}>
<label>Canvas color<ColorControl value={pageSettings.background} onChange={x=>updatePage(p=>{pageDefaults(p);p.settings!.background=x})}/></label>
</Section>
<Section title="Page navigation" icon={<Navigation size={14}/>}>
<Toggle label="Show Previous / Next navigation" value={pageSettings.showNavigation} onChange={x=>updatePage(p=>{pageDefaults(p);p.settings!.showNavigation=x})}/>
{pageSettings.showNavigation&&<>
<label>Navigation position<select value={pageSettings.navigationPosition||'outside'} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.navigationPosition=e.target.value as any})}><option value="outside">Bottom outside page</option><option value="sticky">Bottom sticky</option></select></label>
<div className="twoCol"><label>Top margin<input type="number" min="0" max="120" value={pageSettings.navigationTopMargin??16} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.navigationTopMargin=+e.target.value})}/></label><label>Bottom margin<input type="number" min="0" max="160" value={pageSettings.navigationBottomMargin??24} onChange={e=>updatePage(p=>{pageDefaults(p);p.settings!.navigationBottomMargin=+e.target.value})}/></label></div>
<div className="formatHint">Navigation is rendered after the complete report page height. It no longer consumes canvas height or floats in the middle of a tall page.</div>
</>}
</Section></div>}</div>;
}
export default function ReportWorkbench(){
  // Prevent a single gallery gesture from creating the same visual twice.
  // Some browser/input combinations can dispatch duplicate click paths in rapid succession.
  const visualAddGuardRef=useRef<{type:VisualType;at:number}|null>(null);

  const{project,update,selectedVisualId,selectVisual}=useStudio();
  const initial=project?.report.activePageId||project?.report.pages?.[0]?.id||'page-1';
  const[activePage,setActivePage]=useState(initial),[interactionFilters,setInteractionFilters]=useState<VisualFilter[]>([]),
  [dataPaneVisible,setDataPaneVisible]=useState(false),[propertiesVisible,setPropertiesVisible]=useState(true),
  [galleryVisible,setGalleryVisible]=useState(true),[pageTabsVisible,setPageTabsVisible]=useState(true),
  [appSidebarVisible,setAppSidebarVisible]=useState(true),[panelMenu,setPanelMenu]=useState(false),
  [designerView,setDesignerView]=useState<'fit'|'actual'>('fit'),[designerScale,setDesignerScale]=useState(1),
  [layoutMode,setLayoutMode]=useState<'guided'|'freeform'>('freeform'),[arrangeMenu,setArrangeMenu]=useState(false);
  const canvasRef=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{document.body.classList.toggle('hideAppSidebar',!appSidebarVisible);return()=>document.body.classList.remove('hideAppSidebar')},[appSidebarVisible]);
  useEffect(()=>{
    if(!project||designerView==='actual'){setDesignerScale(1);return}
    const pg=project.report.pages.find(p=>p.id===activePage)||project.report.pages[0];if(!pg)return;
    const width=pg.settings?.pageWidth||1920,height=pg.settings?.pageHeight||1080;const visualBottom=(pg.visuals||[]).reduce((m,v)=>Math.max(m,(v.y||0)*66+(v.h||2)*50+Math.max(0,(v.h||2)-1)*16),0);const headerH=pg.settings?.header?.visible?(pg.settings?.header?.height||84):0;const contentHeight=Math.max(480,headerH+34+visualBottom+(pg.settings?.footerGap??96));const effectiveHeight=Math.max(height,contentHeight);const navExtra=pg.settings?.showNavigation?72:0;const wrap=canvasRef.current;if(!wrap)return;
    const compute=()=>{const r=wrap.getBoundingClientRect();const availW=Math.max(500,r.width-22),availH=Math.max(420,r.height-22);setDesignerScale(Math.max(.1,Math.min(availW/width,availH/(effectiveHeight+navExtra))))};
    compute();const ro=new ResizeObserver(compute);ro.observe(wrap);window.addEventListener('resize',compute);return()=>{ro.disconnect();window.removeEventListener('resize',compute)};
  },[project,activePage,designerView,dataPaneVisible,propertiesVisible,appSidebarVisible,pageTabsVisible]);
  if(!project)return null;
  if(!project.report.pages.length){project.report.pages.push({id:'page-1',name:'Page 1',visuals:[],filters:[],settings:defaultPageSettings()})}
  const page=pageDefaults(project.report.pages.find(p=>p.id===activePage)||project.report.pages[0]);const selected=page.visuals.find(v=>v.id===selectedVisualId);const roleId=project.security.activeRoleId;project.report.filters=project.report.filters||[];
  const allSharedFilters=[...(project.report.filters||[]),...(page.filters||[]),...interactionFilters];
  const gridFactor=page.settings?.snapToGrid===false?8:4;
  const layout=page.visuals.map(v=>({i:v.id,x:Math.round(v.x*gridFactor),y:Math.round(v.y*gridFactor),w:Math.round(v.w*gridFactor),h:Math.round(v.h*gridFactor),minW:2*gridFactor,minH:2*gridFactor}));
  const updatePage=(fn:(p:Page)=>void)=>update(p=>{const pg=p.report.pages.find(x=>x.id===page.id)!;pageDefaults(pg);fn(pg);return p});
  const setReportFilters=(filters:VisualFilter[])=>update(p=>{p.report.filters=filters;return p});
  const onLayout=(l:Layout[])=>updatePage(pg=>{for(const x of l){const v=pg.visuals.find(z=>z.id===x.i)!;Object.assign(v,{x:x.x/gridFactor,y:x.y/gridFactor,w:x.w/gridFactor,h:x.h/gridFactor})}});
  const newVisual=(type:VisualType):Visual=>({id:crypto.randomUUID(),type,title:visualLabels[type],x:0,y:0,w:type==='textbox'?6:type==='button'?3:(type==='kpi'||type==='card'||type==='progress')?3:(type==='table'||type==='matrix')?12:6,h:type==='textbox'?3:type==='button'?2:(type==='kpi'||type==='card'||type==='progress')?3:(type==='table'||type==='matrix')?7:6,text:type==='textbox'?'Add narrative text, notes or instructions here.':undefined,buttonLabel:type==='button'?'Go to page':undefined,action:type==='button'?{type:'none'}:undefined,slicerStyle:type==='slicer'?'list':undefined,bindings:{axis:[],values:[],target:[]},filters:[],sort:[],format:{accent:visualColor[type]||'#2563eb',fontSize:(type==='kpi'||type==='card')?38:14,showTitle:true,dataLabels:false,background:'#ffffff',fontFamily:'Aptos',fieldFormats:{},titleFontSize:15,titleColor:'#0f172a',labelFontSize:12,labelColor:'#1f2937',labelPosition:'top',legendVisible:true,legendPosition:'bottom',borderVisible:true,borderColor:'#d5dee8',borderWidth:1,borderStyle:'solid',borderEdges:{top:true,right:true,bottom:true,left:true},cornerRadius:16,cornerLinked:true,cornerRadii:{topLeft:16,topRight:16,bottomRight:16,bottomLeft:16},shadow:true,backgroundTransparency:0,gridLines:true,showDataPoints:true,dataPointSize:7,tooltipEnabled:true,tooltipBackground:'#0a1421',tooltipColor:'#dce8f5',indicatorEnabled:false,favorableDirection:'up',positiveColor:'#34d399',negativeColor:'#fb7185',neutralColor:'#94a3b8',subtitle:'',subtitleVisible:false,subtitleColor:'#475569',subtitleFontSize:12,titleFontWeight:700,axisFontSize:12,axisColor:'#475569',axisTitleVisible:false,markerShape:'circle',lineWidth:3,smoothLines:true,barRadius:10,barWidth:42,padding:12,chartOpacity:100}});
  const findSmartSpot=(visuals:Visual[],w:number,h:number)=>{
    const overlaps=(x:number,y:number,v:Visual)=>x<v.x+v.w&&x+w>v.x&&y<v.y+v.h&&y+h>v.y;
    for(let y=0;y<120;y++){for(let x=0;x<=12-w;x++){if(!visuals.some(v=>overlaps(x,y,v)))return{x,y}}}
    const y=visuals.reduce((m,v)=>Math.max(m,v.y+v.h),0);return{x:0,y:y+1};
  };
  const addVisual=(type:VisualType)=>{const now=performance.now();const prev=visualAddGuardRef.current;if(prev&&prev.type===type&&(now-prev.at)<500)return;visualAddGuardRef.current={type,at:now};const v=newVisual(type);updatePage(pg=>{if(pg.visuals.some(x=>x.id===v.id))return;const spot=findSmartSpot(pg.visuals,v.w,v.h);v.x=spot.x;v.y=spot.y;pg.visuals.push(v)});setTimeout(()=>selectVisual(v.id),0)};
  const addPage=()=>{const id='page-'+Date.now(),name=window.prompt('Page name','New Page')||'New Page';update(p=>{p.report.pages.push({id,name,visuals:[],filters:[],settings:defaultPageSettings()});p.report.activePageId=id;return p});setActivePage(id);setInteractionFilters([])};
  const switchPage=(id:string)=>{setActivePage(id);selectVisual(null);setInteractionFilters([]);update(p=>{p.report.activePageId=id;return p})};
  const executeVisualAction=(actionVisual:Visual)=>{const a=actionVisual.action;if(!a||a.type==='none')return;if(a.type==='navigate'&&a.targetPageId){switchPage(a.targetPageId);return}if(a.type==='clearFilters'){clearAll();return}if(a.targetVisualId&&['toggleVisual','showVisual','hideVisual'].includes(a.type||'')){updatePage(pg=>{const target=pg.visuals.find(x=>x.id===a.targetVisualId);if(!target)return;if(a.type==='toggleVisual')target.hidden=!target.hidden;if(a.type==='showVisual')target.hidden=false;if(a.type==='hideVisual')target.hidden=true})}};
  const idx=project.report.pages.findIndex(p=>p.id===page.id);
  const prev=()=>idx>0&&switchPage(project.report.pages[idx-1].id), next=()=>idx<project.report.pages.length-1&&switchPage(project.report.pages[idx+1].id);
  const uv=(fn:(v:Visual)=>void)=>updatePage(pg=>{const v=pg.visuals.find(x=>x.id===selectedVisualId);if(v){formatDefaults(v);fn(v)}});
  const del=()=>{updatePage(pg=>pg.visuals=pg.visuals.filter(v=>v.id!==selectedVisualId));selectVisual(null)};
  const dup=()=>updatePage(pg=>{const v=pg.visuals.find(x=>x.id===selectedVisualId);if(v){const n=structuredClone(v);n.id=crypto.randomUUID();const spot=findSmartSpot(pg.visuals,n.w,n.h);n.x=spot.x;n.y=spot.y;n.title+=' Copy';pg.visuals.push(n)}});
  const placeSelected=(mode:'left'|'center'|'right'|'top'|'next')=>updatePage(pg=>{const v=pg.visuals.find(x=>x.id===selectedVisualId);if(!v)return;if(mode==='left')v.x=0;if(mode==='center')v.x=Math.max(0,(12-v.w)/2);if(mode==='right')v.x=Math.max(0,12-v.w);if(mode==='top')v.y=0;if(mode==='next'){const others=pg.visuals.filter(x=>x.id!==v.id);v.x=0;v.y=others.reduce((m,x)=>Math.max(m,x.y+x.h),0)+1}});
  const widthSelected=(w:number)=>updatePage(pg=>{const v=pg.visuals.find(x=>x.id===selectedVisualId);if(!v)return;v.w=Math.min(12,Math.max(2,w));if(v.x+v.w>12)v.x=Math.max(0,12-v.w)});
  const nudgeSelected=(dx:number,dy:number)=>updatePage(pg=>{const v=pg.visuals.find(x=>x.id===selectedVisualId);if(!v)return;v.x=Math.max(0,Math.min(12-v.w,v.x+dx));v.y=Math.max(0,v.y+dy)});
  const autoArrangePremium=()=>updatePage(pg=>{const kpis=pg.visuals.filter(v=>['kpi','card','progress'].includes(v.type));const charts=pg.visuals.filter(v=>!['kpi','card','progress','table','matrix'].includes(v.type));const details=pg.visuals.filter(v=>['table','matrix'].includes(v.type));let y=0;kpis.forEach((v,i)=>{v.x=(i%4)*3;v.y=Math.floor(i/4)*3;v.w=3;v.h=3});if(kpis.length)y=Math.ceil(kpis.length/4)*3;charts.forEach((v,i)=>{v.x=(i%2)*6;v.y=y+Math.floor(i/2)*6;v.w=6;v.h=6});if(charts.length)y+=Math.ceil(charts.length/2)*6;details.forEach(v=>{v.x=0;v.y=y;v.w=12;v.h=7;y+=7})});
  const clearAll=()=>{setInteractionFilters([]);update(p=>{p.report.filters=[];const pg=p.report.pages.find(x=>x.id===page.id);if(pg)pg.filters=[];return p})};
  const s=page.settings||defaultPageSettings();
  const designerVisualBottom=(page.visuals||[]).reduce((m,v)=>Math.max(m,(v.y||0)*66+(v.h||2)*50+Math.max(0,(v.h||2)-1)*16),0);
  const designerHeaderHeight=s.header.visible?(s.header.height||84):0;
  const designerContentHeight=Math.max(480,designerHeaderHeight+34+designerVisualBottom+(s.footerGap??96));
  const designerEffectiveHeight=Math.max(s.pageHeight||1080,designerContentHeight);
  return <div className="reportWorkspaceGlass">
    <div className="reportRibbonGlass">
      <div className="panelMenuWrap"><button className="btnGlass" onClick={()=>setPanelMenu(x=>!x)}><Settings2 size={14}/>Panels</button>{panelMenu&&<div className="panelMenuGlass">
        <label className="checkboxGlass"><input type="checkbox" checked={appSidebarVisible} onChange={e=>setAppSidebarVisible(e.target.checked)}/>Application navigation</label>
        <label className="checkboxGlass"><input type="checkbox" checked={dataPaneVisible} onChange={e=>setDataPaneVisible(e.target.checked)}/>Data / Fields pane</label>
        <label className="checkboxGlass"><input type="checkbox" checked={propertiesVisible} onChange={e=>setPropertiesVisible(e.target.checked)}/>Right authoring pane</label>
        <label className="checkboxGlass"><input type="checkbox" checked={galleryVisible} onChange={e=>setGalleryVisible(e.target.checked)}/>Visualizations section</label>
        <label className="checkboxGlass"><input type="checkbox" checked={pageTabsVisible} onChange={e=>setPageTabsVisible(e.target.checked)}/>Page tabs</label>
        <button className="btnGlass" onClick={()=>{setAppSidebarVisible(true);setDataPaneVisible(true);setPropertiesVisible(true);setGalleryVisible(true);setPageTabsVisible(true)}}>Show all panels</button>
        <button className="btnGlass" onClick={()=>{setAppSidebarVisible(false);setDataPaneVisible(false);setPropertiesVisible(false);setGalleryVisible(false);setPageTabsVisible(false)}}>Focus canvas</button>
      </div>}</div>
      <button className="btnGlass" onClick={()=>setDataPaneVisible(!dataPaneVisible)}>{dataPaneVisible?<PanelLeftClose size={14}/>:<PanelLeftOpen size={14}/>}Fields</button>
      <div className="ribbonSpacerGlass"/><div className="designerViewToggleGlass"><button className={'btnGlass '+(designerView==='fit'?'active':'')} onClick={()=>setDesignerView('fit')}><Maximize2 size={14}/>Fit Report</button><button className={'btnGlass '+(designerView==='actual'?'active':'')} onClick={()=>setDesignerView('actual')}><Eye size={14}/>Actual Size</button></div><div className="layoutModeToggleGlass"><button className={'btnGlass '+(layoutMode==='guided'?'active':'')} onClick={()=>{setLayoutMode('guided');updatePage(p=>{pageDefaults(p);p.settings!.allowOverlap=false;p.settings!.snapToGrid=true})}}>Guided</button><button className={'btnGlass '+(layoutMode==='freeform'?'active':'')} onClick={()=>setLayoutMode('freeform')}>Freeform</button></div><div className="arrangeMenuWrap"><button className="btnGlass" onClick={()=>setArrangeMenu(x=>!x)}><LayoutDashboard size={14}/>Arrange</button>{arrangeMenu&&<div className="arrangeMenuGlass"><button className="btnGlass" onClick={()=>{autoArrangePremium();setArrangeMenu(false)}}>Premium layout</button><button className="btnGlass" disabled={!selected} onClick={()=>{placeSelected('left');setArrangeMenu(false)}}>Align left</button><button className="btnGlass" disabled={!selected} onClick={()=>{placeSelected('center');setArrangeMenu(false)}}>Center</button><button className="btnGlass" disabled={!selected} onClick={()=>{placeSelected('right');setArrangeMenu(false)}}>Align right</button><button className="btnGlass" disabled={!selected} onClick={()=>{placeSelected('next');setArrangeMenu(false)}}>Move next</button></div>}</div><button className="btnGlass" onClick={()=>updatePage(p=>{pageDefaults(p);p.settings!.header.visible=true})}><Heading1 size={14}/>Header</button><button className="btnGlass" onClick={clearAll}><Eraser size={14}/>Clear Filters</button><button className="btnGlass" onClick={prev} disabled={idx===0}><ChevronLeft size={14}/></button><button className="btnGlass" onClick={next} disabled={idx===project.report.pages.length-1}><ChevronRight size={14}/></button><button className="btnGlass primary" onClick={addPage}><Plus size={14}/>New Page</button></div>
    <div className={'reportBodyGlass '+(!dataPaneVisible?'dataPaneHidden ':'')+(!propertiesVisible?'propertiesPaneHidden ':'')}>{dataPaneVisible&&<Fields project={project}/>}<div className="canvasStageGlass"><div className="canvasToplineGlass"><div><b>{page.name}</b><span>{s.pageWidth||1920} × {s.pageHeight||1080} · {layoutMode==='guided'?'Guided layout':'Freeform'} · {designerView==='fit'?'Fit view':'Actual size'}</span></div>{s.showNavigation&&<div className="navControlsGlass"><button className="btnGlass" onClick={prev} disabled={idx===0}><ChevronLeft size={14}/>Previous</button><button className="btnGlass" onClick={clearAll}><Eraser size={14}/>Clear Filters</button><span>Page {idx+1} of {project.report.pages.length}</span><button className="btnGlass" onClick={next} disabled={idx===project.report.pages.length-1}>Next<ChevronRight size={14}/></button></div>}<div className="filterSummaryGlass"><Filter size={12}/>{(project.report.filters?.length||0)} report · {(page.filters?.length||0)} page · {interactionFilters.length} interaction</div></div>{selected&&<div className="selectedVisualComposerGlass"><div className="selectionIdentityGlass"><span style={{background:visualColor[selected.type]||'#2563eb'}}>{visualLabels[selected.type]}</span><b>{selected.title}</b></div><div className="composerGroupGlass"><small>Align</small><button className="btnGlass" onClick={()=>placeSelected('left')}>Left</button><button className="btnGlass" onClick={()=>placeSelected('center')}>Center</button><button className="btnGlass" onClick={()=>placeSelected('right')}>Right</button><button className="btnGlass" onClick={()=>placeSelected('top')}>Top</button></div><div className="composerGroupGlass"><small>Width</small><button className="btnGlass" onClick={()=>widthSelected(3)}>¼</button><button className="btnGlass" onClick={()=>widthSelected(4)}>⅓</button><button className="btnGlass" onClick={()=>widthSelected(6)}>½</button><button className="btnGlass" onClick={()=>widthSelected(12)}>Full</button></div><div className="composerNudgeGlass"><button className="btnGlass" onClick={()=>nudgeSelected(-1,0)}>←</button><button className="btnGlass" onClick={()=>nudgeSelected(0,-1)}>↑</button><button className="btnGlass" onClick={()=>nudgeSelected(0,1)}>↓</button><button className="btnGlass" onClick={()=>nudgeSelected(1,0)}>→</button></div><button className="btnGlass" onClick={dup}>Duplicate</button><button className="btnGlass danger" onClick={del}>Delete</button></div>}
      <div className={'canvasWrapGlass align-'+(s.pageAlignment||'center')+' '+(s.showGrid!==false?'showDesignerGrid':'hideDesignerGrid')} ref={canvasRef} style={{backgroundColor:'transparent'}}>
        <div className="designerScaleFrameGlass" style={{width:(s.pageWidth||1920)*designerScale,height:designerEffectiveHeight*designerScale}}>
        <div className="reportPageSurfaceGlass" style={{background:s.background,width:s.pageWidth||1920,height:designerEffectiveHeight,minHeight:designerEffectiveHeight,transform:`scale(${designerScale})`,transformOrigin:'top left'}}>
          {s.backgroundImage&&<div className={'pageBackgroundImage fit-'+(s.backgroundImageFit||'cover')} style={{backgroundImage:`url(${s.backgroundImage})`,opacity:(s.backgroundImageOpacity??24)/100}}/>}
          <div className="pageContentLayer">
          {s.header.visible&&<div className="dashboardHeaderGlass" style={{background:s.header.background,textAlign:s.header.alignment,'--header-bg':s.header.background,'--header-height':`${s.header.height||84}px`,'--header-pad-top':`${s.header.paddingTop??12}px`,'--header-pad-bottom':`${s.header.paddingBottom??12}px`,'--header-pad-left':`${s.header.paddingLeft??24}px`,'--header-pad-right':`${s.header.paddingRight??24}px`,'--header-radius':`${s.header.borderRadius??14}px`} as any}><div className="dashboardHeaderCopyGlass"><h1 style={{fontSize:s.header.fontSize,color:s.header.titleColor}}>{s.header.title}</h1><p style={{fontSize:s.header.subtitleFontSize??12,color:s.header.subtitleColor}}>{s.header.subtitle}</p></div>{s.header.showGeneratedInfo!==false&&<div className="designerGeneratedInfoGlass" style={{background:s.header.generatedInfoBackground||'#f8fbff'}}><CalendarDays size={18}/><div><small>REPORT GENERATED</small><b>{new Date().toLocaleDateString()}</b></div></div>}</div>}
          <GridLayout className="layout pleasantLayout" layout={layout} cols={12*gridFactor} rowHeight={50/gridFactor} width={Math.max(840,(s.pageWidth||1920))} margin={[16/gridFactor,16/gridFactor]} containerPadding={[0,0]} style={{height:Math.max(520,designerEffectiveHeight-designerHeaderHeight-72),minHeight:Math.max(520,designerEffectiveHeight-designerHeaderHeight-72)}} autoSize={false} isBounded={false} transformScale={designerScale} onLayoutChange={onLayout} draggableHandle=".visualMoveZone" draggableCancel=".visualHeaderActions,button,input,select,textarea,.slicerList" compactType={null} preventCollision={layoutMode==='guided'} resizeHandles={['se','s','e','sw','w','n','ne','nw']}>{page.visuals.map(v=><div key={v.id}><VisualCard v={v} model={project.model} selected={selectedVisualId===v.id} onSelect={()=>selectVisual(v.id)} roleId={roleId} extraFilters={allSharedFilters} onSlicer={f=>setInteractionFilters(f?[f]:[])} onChange={fn=>updatePage(pg=>{const vv=pg.visuals.find(x=>x.id===v.id);if(vv)fn(vv)})} onAction={executeVisualAction} onDuplicate={()=>updatePage(pg=>{const src=pg.visuals.find(x=>x.id===v.id);if(src){const n=structuredClone(src);n.id=crypto.randomUUID();n.x=Math.min(10,n.x+1);n.y+=1;n.title+=' Copy';pg.visuals.push(n)}})}/></div>)}</GridLayout>
          
          </div>
        </div>
        </div>
      </div></div>
      {propertiesVisible&&<RightPane model={{...project.model,__pages:project.report.pages}} visual={selected} updateVisual={uv} removeVisual={del} duplicate={dup} page={page} updatePage={updatePage} reportFilters={project.report.filters||[]} setReportFilters={setReportFilters} addVisual={addVisual} galleryVisible={galleryVisible}/>}
    </div>
    {(allSharedFilters.length>0)&&<div className="activeFilterStripGlass"><b>Active filters</b>{allSharedFilters.map((f,i)=><span key={i}>{f.field} {f.operator} {String(f.value)}</span>)}<button className="btnGlass" onClick={clearAll}>Clear all</button></div>}
    {pageTabsVisible&&<div className="pageTabsGlass"><button className="iconGlass navMini" onClick={prev} disabled={idx===0}><ChevronLeft size={14}/></button>{project.report.pages.map(p=><button key={p.id} onClick={()=>switchPage(p.id)} className={'pageTabGlass '+(page.id===p.id?'active':'')}>{p.name}</button>)}<button className="iconGlass addPageTab" onClick={addPage}><Plus size={16}/></button><button className="iconGlass navMini" onClick={next} disabled={idx===project.report.pages.length-1}><ChevronRight size={14}/></button></div>}
  </div>;
}
