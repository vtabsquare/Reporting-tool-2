import {useMemo,useState} from 'react';
import ReactECharts from 'echarts-for-react';
import type { Visual } from '../types';
import { formatForField } from '../formatting';


function PremiumDataTable({rows,formats,matrix=false}:{rows:any[];formats:any;matrix?:boolean}){
  const[search,setSearch]=useState('');const[page,setPage]=useState(0);const[sort,setSort]=useState<{field:string,dir:'asc'|'desc'}|null>(null);const pageSize=20;
  const columns=rows.length?Object.keys(rows[0]):[];
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();let data=!q?rows:rows.filter(r=>columns.some(c=>String(r[c]??'').toLowerCase().includes(q)));if(sort){data=[...data].sort((a,b)=>{const av=a[sort.field],bv=b[sort.field];const cmp=typeof av==='number'&&typeof bv==='number'?av-bv:String(av??'').localeCompare(String(bv??''));return sort.dir==='asc'?cmp:-cmp})}return data},[rows,search,sort]);
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));const current=Math.min(page,pages-1);const visible=filtered.slice(current*pageSize,(current+1)*pageSize);
  const numericMax:Record<string,number>={};for(const c of columns){numericMax[c]=Math.max(...filtered.map(r=>typeof r[c]==='number'?Math.abs(r[c]):0),1)}
  return <div className={'premiumDataTable '+(matrix?'matrixMode':'')}>
    <div className="premiumTableToolbar"><div className="premiumTableSearch">⌕<input value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}} placeholder="Search rows…"/></div><span>{filtered.length.toLocaleString()} rows</span></div>
    <div className="tableWrap premiumTable"><table><thead><tr>{columns.map(c=><th key={c} onClick={()=>setSort(s=>s?.field===c?{field:c,dir:s.dir==='asc'?'desc':'asc'}:{field:c,dir:'asc'})}>{c}<span>{sort?.field===c?(sort.dir==='asc'?' ↑':' ↓'):''}</span></th>)}</tr></thead><tbody>{visible.map((row,ri)=><tr key={ri}>{columns.map((c,ci)=>{const numeric=typeof row[c]==='number';const pct=numeric?Math.min(100,Math.abs(row[c])/numericMax[c]*100):0;return <td key={c} className={matrix&&ci===0?'matrixRowHeader':''} style={numeric?{backgroundImage:`linear-gradient(90deg, rgba(37,99,235,.08) ${pct}%, transparent ${pct}%)`}:undefined}>{numeric?formatForField(row[c],c,formats):String(row[c]??'')}</td>})}</tr>)}</tbody></table></div>
    <div className="premiumTablePager"><button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={current===0}>Previous</button><span>Page {current+1} of {pages}</span><button onClick={()=>setPage(p=>Math.min(pages-1,p+1))} disabled={current>=pages-1}>Next</button></div>
  </div>
}

export default function Chart({ visual, rows, onPointClick }: { visual: Visual; rows: any[]; onPointClick?:(field:string,value:any)=>void }) {
  const axis = (visual.bindings.axis || []).slice(-1)[0];
  const valueField = visual.bindings.values?.[0];
  const targetField = visual.bindings.target?.[0];
  const legendField=visual.bindings.legend?.[0];
  const accent = visual.format.accent || '#22d3ee';
  const formats = visual.format.fieldFormats || {};
  const fmt = (value: any, field = valueField) => formatForField(value, field, formats);
  const labelColor = visual.format.labelColor || '#dce8f5';
  const labelSize = visual.format.labelFontSize || 11;
  const axisColor=visual.format.axisColor||'#8497ae';
  const axisSize=visual.format.axisFontSize||10;
  const lineWidth=visual.format.lineWidth||3;
  const smooth=visual.format.smoothLines!==false;
  const marker=visual.format.markerShape||'circle';
  const chartOpacity=Math.max(.2,Math.min(1,(visual.format.chartOpacity??100)/100));
  const fontFamily=`${visual.format.fontFamily||'Aptos'}, 'Segoe UI Variable', 'Segoe UI', sans-serif`;
  const allValueFields=visual.bindings.values||[];
  const premiumPalette=['#2563eb','#10b981','#8b5cf6','#f59e0b','#0ea5e9','#ef4444','#14b8a6','#f97316','#6366f1','#22c55e'];
  const chartEvents=axis&&onPointClick?{click:(p:any)=>{const value=p?.name!==undefined&&p?.name!==''?p.name:rows[p?.dataIndex||0]?.[axis];if(value!==undefined)onPointClick(axis,value)}}:{};


  const legendVisible = visual.format.legendVisible !== false;
  const legendPosition = visual.format.legendPosition || 'bottom';
  const legend: any = {
    show: legendVisible,
    textStyle: { color: '#64748b', fontSize: 11 }
  };
  if (legendPosition === 'top') Object.assign(legend, { top: 0, left: 'center' });
  if (legendPosition === 'bottom') Object.assign(legend, { bottom: 0, left: 'center' });
  if (legendPosition === 'left') Object.assign(legend, { left: 0, top: 'middle', orient: 'vertical' });
  if (legendPosition === 'right') Object.assign(legend, { right: 0, top: 'middle', orient: 'vertical' });

  if (visual.type === 'kpi') {
    const seriesValues=rows.map(r=>Number(r?.[valueField||''])).filter(Number.isFinite);
    const current=seriesValues.length?seriesValues[seriesValues.length-1]:Number(rows?.[0]?.[valueField||'']);
    const explicitTarget=targetField?Number(rows?.[rows.length-1]?.[targetField]):Number.NaN;
    const previous=seriesValues.length>1?seriesValues[seriesValues.length-2]:Number.NaN;
    const compare=Number.isFinite(explicitTarget)?explicitTarget:previous;
    const diff=Number.isFinite(current)&&Number.isFinite(compare)?current-compare:Number.NaN;
    const pct=Number.isFinite(diff)&&compare!==0?diff/Math.abs(compare)*100:Number.NaN;
    const favorable=visual.format.favorableDirection||'up';
    const good=Number.isFinite(diff)&&((favorable==='up'&&diff>0)||(favorable==='down'&&diff<0));
    const bad=Number.isFinite(diff)&&((favorable==='up'&&diff<0)||(favorable==='down'&&diff>0));
    const indicatorColor=good?(visual.format.positiveColor||'#16a34a'):bad?(visual.format.negativeColor||'#dc2626'):(visual.format.neutralColor||'#64748b');
    const arrow=Number.isFinite(diff)?(diff>0?'↑':diff<0?'↓':'→'):'';
    const spark=seriesValues.slice(-18);
    const min=Math.min(...spark,0),max=Math.max(...spark,1),range=max-min||1;
    const points=spark.map((v,i)=>`${spark.length===1?50:(i/(spark.length-1))*100},${34-((v-min)/range)*26}`).join(' ');
    const metricLabel=valueField||'Metric';
    const icon=(metricLabel.match(/sales|revenue|amount|cost|profit|price/i)?'₹':metricLabel.match(/customer|employee|user|people/i)?'●':metricLabel.match(/order|invoice|ticket|case/i)?'▣':'◆');
    return <div className="premiumKpiCard">
      <div className="premiumKpiTop"><span className="premiumKpiIcon" style={{background:`${accent}16`,color:accent}}>{icon}</span><div><small>{metricLabel}</small>{visual.format.subtitleVisible&&visual.format.subtitle&&<span>{visual.format.subtitle}</span>}</div></div>
      <div className="premiumKpiMain"><b style={{fontSize:visual.format.fontSize||38,color:visual.format.titleColor||'#0f172a'}}>{fmt(current)}</b>{arrow&&<div className="premiumKpiDelta" style={{color:indicatorColor}}><strong>{arrow}{Number.isFinite(pct)?` ${Math.abs(pct).toFixed(1)}%`:''}</strong><span>{targetField?`vs ${targetField}`:'vs previous'}</span></div>}</div>
      {spark.length>1&&<div className="premiumSparkline"><svg viewBox="0 0 100 38" preserveAspectRatio="none"><polyline points={points} fill="none" stroke={accent} strokeWidth="2.6" vectorEffect="non-scaling-stroke"/><polyline points={`0,38 ${points} 100,38`} fill={`${accent}10`} stroke="none"/></svg></div>}
    </div>;
  }

  if (visual.type === 'card') {
    const current=rows?.[0]?.[valueField||''];
    return <div className="advancedCardVisual">
      <div className="advancedCardValue" style={{color:accent,fontFamily,fontSize:visual.format.fontSize||32}}>{fmt(current)}</div>
      <div className="advancedCardLabel">{valueField||'Value'}</div>
    </div>;
  }

  if (visual.type === 'multirowcard') {
    const row=rows?.[0]||{};
    const fields=allValueFields.length?allValueFields:Object.keys(row).slice(0,6);
    const tilePalette=['#2563eb','#10b981','#8b5cf6','#f59e0b','#0ea5e9','#ef4444','#14b8a6','#6366f1'];
    const iconFor=(field:string)=>field.match(/sales|revenue|amount|price|cost|profit/i)?'₹':field.match(/customer|employee|user|people/i)?'●':field.match(/product|item|sku/i)?'◆':field.match(/order|invoice|ticket|case/i)?'▣':'#';
    const niceValue=(field:string,value:any)=>{const n=Number(value);if(Number.isFinite(n)&&Number.isInteger(n)&&field.match(/customer|product|order|count|quantity/i))return n.toLocaleString();return formatForField(value,field,formats)};
    return <div className="multiCardGrid premiumMultiCardGrid">{fields.slice(0,8).map((field,i)=>{const c=tilePalette[i%tilePalette.length];return <div className="multiCardItem premiumMultiCardItem" key={field} style={{'--metric-color':c} as any}><span className="premiumMultiIcon" style={{background:`${c}14`,color:c}}>{iconFor(field)}</span><div><span className="premiumMultiLabel">{field.replace(/^.*\./,'').replace(/_/g,' ')}</span><b>{niceValue(field,row[field])}</b><small>Current value</small></div></div>})}</div>;
  }

  if (visual.type === 'progress') {
    const current=Number(rows?.[0]?.[valueField||'']||0);
    const target=targetField?Number(rows?.[0]?.[targetField]||0):Math.max(current,100);
    const pct=target?Math.max(0,Math.min(100,current/target*100)):0;
    return <div className="progressVisual"><div className="progressMetric"><b style={{color:accent}}>{fmt(current)}</b><span>{targetField?`of ${fmt(target,targetField)}`:`${pct.toFixed(1)}%`}</span></div><div className="progressTrack"><i style={{width:`${pct}%`,background:accent}}/></div><small>{valueField||'Progress'}</small></div>;
  }

  if (visual.type === 'matrix') return <PremiumDataTable rows={rows} formats={formats} matrix/>;

  if (visual.type === 'table') return <PremiumDataTable rows={rows} formats={formats}/>;

  const names = rows.map((row) => row[axis || '']);
  const values = rows.map((row) => row[valueField || '']);
  const tooltipFormatter = (params: any) => {
    const entries = Array.isArray(params) ? params : [params];
    const first = entries[0];
    const dataIndex = first?.dataIndex ?? 0;
    const row = rows[dataIndex] || {};
    const main = entries.map((p: any) => `${p.marker || ''}${p.name}<br/><b>${fmt(p.value)}</b>`).join('<br/>');
    const extras=(visual.bindings.tooltips||[]).map((field)=>`${field}: <b>${formatForField(row[field],field,formats)}</b>`).join('<br/>');
    return extras ? `${main}<br/>${extras}` : main;
  };


  if (visual.type === 'treemap') {
    return <ReactECharts style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{show:visual.format.tooltipEnabled!==false,formatter:(p:any)=>`${p.name}<br/><b>${fmt(p.value)}</b>`},
      series:[{type:'treemap',roam:false,nodeClick:false,breadcrumb:{show:false},label:{show:true,color:labelColor,fontFamily,fontSize:labelSize,formatter:(p:any)=>`${p.name}\n${fmt(p.value)}`},
        upperLabel:{show:false},itemStyle:{borderColor:'#ffffff',borderWidth:2,gapWidth:2},data:rows.map(r=>({name:String(r[axis||'']),value:Number(r[valueField||'']||0)}))}]
    }}/>;
  }

  if (visual.type === 'funnel') {
    return <ReactECharts style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{trigger:'item'},series:[{type:'funnel',left:'8%',top:12,bottom:12,width:'84%',sort:'descending',gap:3,
        label:{show:visual.format.dataLabels!==false,color:labelColor,fontFamily,fontSize:labelSize,formatter:(p:any)=>`${p.name}  ${fmt(p.value)}`},
        itemStyle:{borderColor:'#ffffff',borderWidth:1,opacity:chartOpacity},
        data:rows.map(r=>({name:String(r[axis||'']),value:Number(r[valueField||'']||0)}))}]
    }}/>;
  }

  if (visual.type === 'waterfall') {
    const nums=values.map(v=>Number(v)||0);let running=0;
    const helpers=nums.map(v=>{const start=running;running+=v;return start});
    return <ReactECharts style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{trigger:'axis'},grid:{left:58,right:20,top:16,bottom:48},
      xAxis:{type:'category',data:names,axisLabel:{color:axisColor,fontSize:axisSize,fontFamily}},
      yAxis:{type:'value',axisLabel:{color:axisColor,fontSize:axisSize,formatter:(x:number)=>fmt(x)},splitLine:{show:visual.format.gridLines!==false,lineStyle:{color:'#e2e8f0',type:'dashed'}}},
      series:[
        {type:'bar',stack:'wf',silent:true,itemStyle:{color:'transparent'},data:helpers},
        {type:'bar',stack:'wf',barMaxWidth:visual.format.barWidth||38,data:nums.map(v=>({value:Math.abs(v),itemStyle:{color:v>=0?(visual.format.positiveColor||'#34d399'):(visual.format.negativeColor||'#fb7185')}})),
         label:{show:visual.format.dataLabels,color:labelColor,position:'top',formatter:(p:any)=>fmt(nums[p.dataIndex])}}
      ]
    }}/>;
  }

  if (visual.type === 'radar') {
    const max=Math.max(...values.map(v=>Math.abs(Number(v)||0)),1)*1.2;
    return <ReactECharts style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{},radar:{indicator:names.slice(0,12).map(n=>({name:String(n),max})),axisName:{color:axisColor,fontSize:axisSize,fontFamily},splitLine:{lineStyle:{color:'#dbe4ee'}},splitArea:{areaStyle:{color:['#f8fafc','#f1f5f9']}}},
      series:[{type:'radar',data:[{value:values.slice(0,12).map(v=>Number(v)||0),name:valueField}],lineStyle:{color:accent,width:lineWidth},itemStyle:{color:accent},areaStyle:{color:accent,opacity:.18}}]
    }}/>;
  }

  if (visual.type === 'heatmap') {
    const max=Math.max(...values.map(v=>Number(v)||0),1);
    return <ReactECharts style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{position:'top'},grid:{left:100,right:20,top:18,bottom:42},
      xAxis:{type:'category',data:names,axisLabel:{color:axisColor,fontSize:axisSize,rotate:names.length>12?45:0}},
      yAxis:{type:'category',data:[valueField||'Value'],axisLabel:{color:axisColor}},
      visualMap:{min:0,max,calculable:false,orient:'horizontal',left:'center',bottom:0,inRange:{color:['#10283b',accent]}},
      series:[{type:'heatmap',data:values.map((v,i)=>[i,0,Number(v)||0]),label:{show:visual.format.dataLabels,color:labelColor,formatter:(p:any)=>fmt(p.value[2])},itemStyle:{borderColor:'#ffffff',borderWidth:2}}]
    }}/>;
  }

  if (visual.type === 'histogram') {
    const nums=values.map(v=>Number(v)).filter(Number.isFinite);
    const bins=Math.max(5,Math.min(20,Math.round(Math.sqrt(nums.length||1))));
    const min=Math.min(...nums,0),max=Math.max(...nums,1),step=(max-min||1)/bins;
    const counts=Array(bins).fill(0);nums.forEach(v=>counts[Math.min(bins-1,Math.floor((v-min)/step))]++);
    const labels=counts.map((_,i)=>`${(min+i*step).toFixed(1)}–${(min+(i+1)*step).toFixed(1)}`);
    return <ReactECharts style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{trigger:'axis'},grid:{left:48,right:18,top:14,bottom:58},xAxis:{type:'category',data:labels,axisLabel:{color:axisColor,fontSize:8,rotate:40}},
      yAxis:{type:'value',axisLabel:{color:axisColor},splitLine:{lineStyle:{color:'#e2e8f0'}}},
      series:[{type:'bar',data:counts,barGap:'0%',barCategoryGap:'3%',itemStyle:{color:accent,opacity:chartOpacity,borderRadius:[visual.format.barRadius||4,visual.format.barRadius||4,0,0]}}]
    }}/>;
  }

  if (visual.type === 'boxplot') {
    const nums=values.map(v=>Number(v)).filter(Number.isFinite).sort((a,b)=>a-b);
    const q=(p:number)=>nums.length?nums[Math.min(nums.length-1,Math.floor((nums.length-1)*p))]:0;
    const data=[[q(0),q(.25),q(.5),q(.75),q(1)]];
    return <ReactECharts style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{trigger:'item'},grid:{left:55,right:20,top:20,bottom:42},xAxis:{type:'category',data:[valueField||'Distribution'],axisLabel:{color:axisColor}},yAxis:{type:'value',axisLabel:{color:axisColor,formatter:(x:number)=>fmt(x)},splitLine:{lineStyle:{color:'#e2e8f0'}}},
      series:[{type:'boxplot',data,itemStyle:{color:`${accent}55`,borderColor:accent,borderWidth:2}}]
    }}/>;
  }

  if (visual.type === 'bubble') {
    const second=allValueFields[1];const secondVals=second?rows.map(r=>Number(r[second])||0):values.map((v,i)=>i+1);
    const max2=Math.max(...secondVals.map(Math.abs),1);
    return <ReactECharts style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{trigger:'item',formatter:(p:any)=>`${p.name}<br/>${valueField}: <b>${fmt(p.value[1])}</b>${second?`<br/>${second}: ${formatForField(p.value[2],second,formats)}`:''}`},
      grid:{left:55,right:25,top:18,bottom:42},xAxis:{type:'category',data:names,axisLabel:{color:axisColor,fontSize:axisSize}},yAxis:{type:'value',axisLabel:{color:axisColor,formatter:(x:number)=>fmt(x)},splitLine:{lineStyle:{color:'#e2e8f0'}}},
      series:[{type:'scatter',data:values.map((v,i)=>[names[i],Number(v)||0,secondVals[i]]),symbolSize:(d:any)=>10+Math.abs(d[2])/max2*35,itemStyle:{color:accent,opacity:.75}}]
    }}/>;
  }

  if (visual.type === 'combo') {
    const second=allValueFields[1];const secondData=second?rows.map(r=>r[second]):values;
    return <ReactECharts style={{height:'100%'}} onEvents={chartEvents} option={{
      tooltip:{trigger:'axis'},legend:{...legend,data:[valueField,second].filter(Boolean)},grid:{left:58,right:54,top:22,bottom:48},
      xAxis:{type:'category',data:names,axisLabel:{color:axisColor,fontSize:axisSize}},
      yAxis:[{type:'value',axisLabel:{color:axisColor,formatter:(x:number)=>fmt(x,valueField)}},{type:'value',axisLabel:{color:axisColor,formatter:(x:number)=>formatForField(x,second,formats)}}],
      series:[{name:valueField,type:'bar',data:values,barMaxWidth:visual.format.barWidth||34,itemStyle:{color:accent,borderRadius:[visual.format.barRadius||5,visual.format.barRadius||5,0,0]}},
       {name:second||valueField,type:'line',yAxisIndex:1,data:secondData,smooth,lineStyle:{color:visual.format.positiveColor||'#34d399',width:lineWidth},symbol:marker,symbolSize:visual.format.dataPointSize||7}]
    }}/>;
  }

  if (visual.type === 'donut' || visual.type === 'pie') {
    const total=values.reduce((a:any,b:any)=>Number(a||0)+Number(b||0),0);
    const autoLegend=rows.length<=6?(legendPosition||'bottom'):'right';
    const premiumLegend:any={show:legendVisible,textStyle:{color:'#475569',fontSize:11,fontWeight:600},itemWidth:12,itemHeight:12,itemGap:14};
    if(autoLegend==='right')Object.assign(premiumLegend,{right:12,top:'middle',orient:'vertical'});
    else if(autoLegend==='left')Object.assign(premiumLegend,{left:12,top:'middle',orient:'vertical'});
    else if(autoLegend==='top')Object.assign(premiumLegend,{top:0,left:'center'});
    else Object.assign(premiumLegend,{bottom:0,left:'center'});
    const center:any=(autoLegend==='right'?['42%','46%']:autoLegend==='left'?['58%','46%']:['50%','43%']);
    return (
      <ReactECharts
        style={{ height: '100%' }}
        onEvents={chartEvents}
        option={{
          animationDuration: 750,
          animationEasing:'cubicOut',
          color:premiumPalette,
          tooltip: {
            show: visual.format.tooltipEnabled !== false,
            trigger: 'item',
            backgroundColor: visual.format.tooltipBackground || '#081525',
            borderColor:'#20354f',
            padding:[10,12],
            textStyle: { color: visual.format.tooltipColor || '#f8fafc',fontSize:12 },
            formatter: (p: any) => {
              const row=rows[p.dataIndex]||{};
              const extras=(visual.bindings.tooltips||[]).map((field)=>`${field}: <b>${formatForField(row[field],field,formats)}</b>`).join('<br/>');
              return `<b>${p.name}</b><br/>${p.marker}${fmt(p.value)} &nbsp; <span style="color:#94a3b8">${p.percent}%</span>${extras?'<br/>'+extras:''}`;
            }
          },
          legend:premiumLegend,
          graphic: visual.type==='donut'&&values.length?[{type:'text',left:center[0],top:'38%',style:{text:fmt(total),fill:'#0f172a',fontSize:24,fontWeight:800,textAlign:'center'},z:10},{type:'text',left:center[0],top:'50%',style:{text:(valueField||'Total').replace(/^.*\./,''),fill:'#64748b',fontSize:10,fontWeight:600,textAlign:'center'},z:10}]:[],
          series: [
            {
              type: 'pie',
              radius: visual.type === 'donut' ? ['43%', '68%'] : '64%',
              center,
              minAngle:2,
              avoidLabelOverlap:true,
              data: rows.map((row) => ({name: row[axis || ''],value: row[valueField || '']})),
              itemStyle: { borderColor: '#ffffff', borderWidth: 3,borderRadius:5,shadowBlur:4,shadowColor:'rgba(15,23,42,.08)' },
              emphasis:{scale:true,scaleSize:8,itemStyle:{shadowBlur:18,shadowColor:'rgba(15,23,42,.22)'}},
              labelLine:{show:rows.length<=8,length:13,length2:10,lineStyle:{width:1.4}},
              label: {
                show: rows.length<=8 ? true : visual.format.dataLabels,
                color: '#334155',
                fontSize: Math.max(11,labelSize),
                lineHeight:15,
                formatter: (p: any) => `{name|${p.name}}\n{value|${fmt(p.value)} (${p.percent}%)} `,
                rich:{name:{fontWeight:700,color:'#334155',fontSize:11},value:{fontWeight:600,color:'#64748b',fontSize:10}}
              }
            }
          ]
        }}
      />
    );
  }

  if (visual.type === 'gauge') {
    const numberValue = Number(values[0] || 0);
    const maximum = Math.max(Math.abs(numberValue) * 1.25, 100);
    return (
      <ReactECharts
        style={{ height: '100%' }}
        onEvents={chartEvents}
        option={{
          series: [
            {
              type: 'gauge',
              max: maximum,
              progress: { show: true, width: 13 },
              axisLine: {
                lineStyle: {
                  width: 13,
                  color: [[1, '#1f3147']]
                }
              },
              axisLabel: { color: '#768aa2' },
              axisTick: { show: false },
              splitLine: { show: false },
              pointer: { width: 4 },
              detail: {
                valueAnimation: true,
                color: '#e2e8f0',
                fontSize: 20,
                formatter: (x: number) => fmt(x)
              },
              data: [{ value: numberValue, name: valueField || '' }],
              itemStyle: { color: accent },
              title: { color: '#71859e', fontSize: 10 }
            }
          ]
        }}
      />
    );
  }

  if (visual.type === 'scatter') {
    return (
      <ReactECharts
        style={{ height: '100%' }}
        onEvents={chartEvents}
        option={{
          tooltip: { trigger: 'item', formatter: tooltipFormatter },
          grid: { left: 54, right: 20, top: 18, bottom: 44 },
          xAxis: {
            type: 'category',
            data: names,
            axisLabel: { color: '#8497ae' }
          },
          yAxis: {
            type: 'value',
            axisLabel: {
              color: '#8497ae',
              formatter: (x: number) => fmt(x)
            },
            splitLine: {
              show: visual.format.gridLines !== false,
              lineStyle: { color: '#e2e8f0' }
            }
          },
          series: [
            {
              type: 'scatter',
              data: values,
              symbolSize: visual.format.dataPointSize || 10,
              itemStyle: {
                color: accent,
                shadowBlur: 8,
                shadowColor: `${accent}55`
              },
              label: {
                show: visual.format.dataLabels,
                color: labelColor,
                fontSize: labelSize,
                formatter: (p: any) => fmt(p.value)
              }
            }
          ]
        }}
      />
    );
  }


  if (legendField && ['bar','column','stackedbar','stackedcolumn','line','area'].includes(visual.type)) {
    const categories=Array.from(new Set(rows.map(r=>String(r[axis||'']))));
    const seriesNames=Array.from(new Set(rows.map(r=>String(r[legendField]))));
    const palette=[accent,...premiumPalette.filter(c=>c.toLowerCase()!==accent.toLowerCase())];
    const horizontal=visual.type==='bar'||visual.type==='stackedbar';
    const categoryAxis:any={type:'category',data:categories,axisLabel:{color:axisColor,fontSize:axisSize,fontFamily},axisTick:{show:false},axisLine:{lineStyle:{color:'#cbd5e1'}}};
    const valueAxis:any={type:'value',axisLabel:{color:axisColor,fontSize:axisSize,fontFamily,formatter:(x:number)=>fmt(x)},splitLine:{show:visual.format.gridLines!==false,lineStyle:{color:'#e2e8f0',type:'dashed'}}};
    const isLine=visual.type==='line'||visual.type==='area';
    const stacked=visual.type==='stackedbar'||visual.type==='stackedcolumn';
    return <ReactECharts style={{height:'100%'}} onEvents={chartEvents} option={{
      animationDuration:650,color:premiumPalette,legend:{...legend,data:seriesNames},
      tooltip:{trigger:'axis',backgroundColor:visual.format.tooltipBackground||'#0a1421',textStyle:{color:visual.format.tooltipColor||'#dce8f5'}},
      grid:{left:horizontal?100:58,right:24,top:28,bottom:52},
      xAxis:horizontal?valueAxis:categoryAxis,yAxis:horizontal?categoryAxis:valueAxis,
      series:seriesNames.map((sn,si)=>({
        name:sn,type:isLine?'line':'bar',stack:stacked?'total':undefined,smooth,
        data:categories.map(cat=>{const row=rows.find(r=>String(r[axis||''])===cat&&String(r[legendField])===sn);return Number(row?.[valueField||'']||0)}),
        itemStyle:{color:palette[si%palette.length],opacity:chartOpacity,borderRadius:!isLine?(stacked?4:[visual.format.barRadius||8,visual.format.barRadius||8,visual.format.barRadius||8,visual.format.barRadius||8]):0},
        emphasis:{focus:'series',itemStyle:{shadowBlur:10,shadowColor:`${palette[si%palette.length]}55`}},
        lineStyle:{color:palette[si%palette.length],width:lineWidth},areaStyle:visual.type==='area'?{opacity:.12}:undefined,
        symbol:marker,symbolSize:visual.format.dataPointSize||7,barMaxWidth:visual.format.barWidth||42,
        label:{show:stacked&&categories.length<=10?true:visual.format.dataLabels,color:stacked?'#ffffff':labelColor,fontWeight:700,fontSize:Math.max(10,labelSize),position:stacked?'inside':horizontal?'right':'top',formatter:(p:any)=>fmt(p.value)}
      }))
    }}/>;
  }

  const horizontal =
    visual.type === 'bar' || visual.type === 'stackedbar';

  const categoryAxis: any = {
    type: 'category',
    data: names,
    axisLabel: { color: axisColor, fontSize: axisSize, fontFamily },
    axisLine: { lineStyle: { color: '#cbd5e1' } },
    axisTick: { show: false }
  };

  const valueAxis: any = {
    type: 'value',
    axisLabel: {
      color: axisColor,
      fontSize: axisSize,
      fontFamily,
      formatter: (x: number) => fmt(x)
    },
    axisLine: { show: false },
    splitLine: {
      show: visual.format.gridLines !== false,
      lineStyle: { color: '#e2e8f0', type: 'dashed' }
    }
  };

  const base: any = {
    animationDuration: 650,
    color:premiumPalette,
    textStyle: { color: '#334155' },
    tooltip: {
      show: visual.format.tooltipEnabled !== false,
      trigger: 'axis',
      backgroundColor: visual.format.tooltipBackground || '#0a1421',
      borderColor: '#2a405c',
      textStyle: { color: visual.format.tooltipColor || '#dce8f5' },
      formatter: tooltipFormatter
    },
    grid: { left: horizontal ? 100 : 58, right: 24, top: 20, bottom: 48 },
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: []
  };

  const chartType =
    visual.type === 'line' || visual.type === 'area' ? 'line' : 'bar';
  const showPoints = visual.format.showDataPoints !== false;

  base.series = [
    {
      type: chartType,
      data: values,
      smooth,
      barMaxWidth: visual.format.barWidth || 38,
      areaStyle: visual.type === 'area' ? { opacity: 0.18 } : undefined,
      itemStyle: {
        color: accent,
        borderRadius: chartType === 'bar' ? (horizontal?[0,visual.format.barRadius||9,visual.format.barRadius||9,0]:[visual.format.barRadius||9,visual.format.barRadius||9,0,0]) : 0,
        opacity: chartOpacity,
        shadowBlur:chartType==='bar'?4:0,
        shadowColor:chartType==='bar'?`${accent}28`:'transparent'
      },
      emphasis:{focus:'series',itemStyle:{shadowBlur:14,shadowColor:`${accent}44`}},
      lineStyle: { color: accent, width: lineWidth },
      symbol: showPoints ? marker : 'none',
      showSymbol: showPoints,
      symbolSize: visual.format.dataPointSize || 7,
      label: {
        show: visual.format.dataLabels,
        color: labelColor,
        fontSize: labelSize,
        position: horizontal
          ? 'right'
          : visual.format.labelPosition === 'inside'
            ? 'inside'
            : 'top',
        formatter: (p: any) => fmt(p.value)
      },
      stack: (visual.type === 'stackedbar'||visual.type==='stackedcolumn') ? 'total' : undefined
    }
  ];

  return <ReactECharts style={{ height: '100%' }} onEvents={chartEvents} option={base} />;
}
