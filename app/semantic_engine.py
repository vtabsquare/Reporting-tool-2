from __future__ import annotations
import re, json, hashlib, time, threading
from collections import OrderedDict
from .dax_engine import compile_dax
from .local_engine import connect

def q(x):return '"'+str(x).replace('"','""')+'"'
def fld(model,dotted):
    t,c=dotted.split('.',1);part=None
    if '::' in c:c,part=c.rsplit('::',1)
    physical=model["tables"][t]["columns"][c];base=f'{q(t)}.{q(physical)}'
    if not part:return base
    d=f'TRY_CAST({base} AS DATE)';p=part.lower()
    if p=='year':return f'year({d})'
    if p=='quarter':return f"'Q' || CAST(quarter({d}) AS VARCHAR)"
    if p=='month':return f"strftime({d}, '%Y-%m')"
    if p=='week':return f"strftime({d}, '%Y-W%W')"
    if p=='day':return f'CAST({d} AS DATE)'
    raise ValueError(f'Unsupported date hierarchy part: {part}')

def measure(name,model,stack=None,context_filters=None,with_meta=False):
    stack=stack or []
    if name in stack:
        raise ValueError('Circular measure dependency: '+' -> '.join(stack+[name]))
    if name not in model.get('measures',{}):
        # Auto-aggregate raw column references (e.g. "Finance Data.LOAN AMOUNT")
        # that were dragged from the numeric fields pane directly into Values.
        if '.' in name:
            try:
                parts=name.split('.',1)
                t,c=parts[0].strip(),parts[1].strip()
                if t in model.get('tables',{}) and c in model['tables'][t].get('columns',{}):
                    sql=f'SUM(TRY_CAST({fld(model,name)} AS DOUBLE))'
                    return (sql,set()) if with_meta else sql
            except Exception:
                pass
        raise ValueError(f"Unknown measure [{name}]")
    exp=model['measures'][name].strip()

    def resolve_measure(ref):
        return measure(ref,model,stack+[name],context_filters,False)

    if re.search(r'[A-Za-z_][\w ]*\[[^\]]+\]',exp) or re.search(r'(?i)\b(VAR|RETURN|CALCULATE|EDATE|DATESBETWEEN)\b',exp):
        c=compile_dax(exp,model,context_filters or [],resolve_measure)
        return (c.sql,c.override_fields) if with_meta else c.sql

    m=re.fullmatch(r'(SUM|AVG|MIN|MAX|COUNT|DISTINCTCOUNT)\(([^.]+)\.(.+)\)',exp,re.I)
    if m:
        sql=f'{m.group(1).upper()}({fld(model,m.group(2).strip()+"."+m.group(3).strip())})'
        return (sql,set()) if with_meta else sql

    if exp.upper().startswith('DIVIDE('):
        inner=exp[7:-1];depth=0;cut=None
        for i,ch in enumerate(inner):
            if ch=='(':depth+=1
            elif ch==')':depth-=1
            elif ch==',' and depth==0:cut=i;break
        if cut is None:
            raise ValueError('DIVIDE requires two arguments')
        a,b=inner[:cut],inner[cut+1:]
        def ce(x):
            x=x.strip()
            m2=re.fullmatch(r'\[([^]]+)\]',x)
            return measure(m2.group(1),model,stack+[name],context_filters,False) if m2 else inline(x,model,stack+[name],context_filters)
        aa,bb=ce(a),ce(b)
        sql=f'(({aa})/NULLIF(({bb}),0))'
        return (sql,set()) if with_meta else sql

    sql=inline(exp,model,stack+[name],context_filters)
    return (sql,set()) if with_meta else sql

def inline(exp,model,stack,context_filters=None):
    if re.search(r"[;'\"`]",exp):
        raise ValueError('Unsafe measure expression')
    out=exp
    for ref in re.findall(r'\[([^]]+)\]',exp):
        out=out.replace(f'[{ref}]',f'({measure(ref,model,stack,context_filters,False)})')
    return out

def required(model,dims,measures,rls,filters=()):
    # Every field referenced by a visual dimension, slicer/cross-filter, page/report filter,
    # or RLS predicate must participate in relationship-path planning.  Previously filter
    # tables were omitted, so a Customers[CustomerName] slicer could be compiled into the
    # WHERE clause while only the Sales table existed in FROM, producing a DuckDB Binder Error.
    req={d.split('.',1)[0] for d in dims}
    for f in filters or ():
        field=f.get('field') if isinstance(f,dict) else None
        if field and '.' in field:
            table=field.split('.',1)[0]
            if table in model.get('tables',{}):
                req.add(table)
    names=set(measures);changed=True
    while changed:
        changed=False
        for n in list(names):
            exp=model.get('measures',{}).get(n,'')
            # Bracket refs not immediately preceded by a table identifier are measure refs.
            for ref in re.findall(r'(?<![A-Za-z0-9_])\[([^]]+)\]',exp):
                if ref in model.get('measures',{}) and ref not in names:
                    names.add(ref);changed=True
    txt=' '.join(model.get('measures',{}).get(n,'') for n in names)
    for t in model['tables']:
        if t+'.' in txt or re.search(r'(?i)\b'+re.escape(t)+r'\s*\[',txt):req.add(t)
    for r in rls:req.add(r['table'])
    return req

def compile_query(model,req,rls=()):
    dims=req.get('dimensions',[]);meas=req.get('measures',[]);needed=required(model,dims,meas,rls,req.get('filters',[]))
    # Anchor the query on the table that owns the selected measure whenever possible.
    # This keeps fact-table aggregations stable when a slicer/filter comes from a dimension.
    measure_text=' '.join(model.get('measures',{}).get(m,'') for m in meas)
    preferred=[]
    for table in model.get('tables',{}):
        if table in needed and (table+'.' in measure_text or re.search(r'(?i)\b'+re.escape(table)+r'\s*\[',measure_text)):
            preferred.append(table)
    if not preferred:
        for d in dims:
            table=d.split('.',1)[0]
            if table in needed and table not in preferred: preferred.append(table)
    base=preferred[0] if preferred else ('Sales' if 'Sales' in needed else next(iter(needed or model['tables'])))
    joined={base};joins=[]
    while not needed.issubset(joined):
        progress=False
        for r in model['relationships']:
            if r.get('active',True) is False: continue
            a,b=r['fromTable'],r['toTable']
            if a in joined and b in needed and b not in joined:
                joins.append(f'LEFT JOIN {q(model["tables"][b]["physical"])} {q(b)} ON {fld(model,a+"."+r["fromColumn"])}={fld(model,b+"."+r["toColumn"])}');joined.add(b);progress=True
            elif b in joined and a in needed and a not in joined:
                joins.append(f'LEFT JOIN {q(model["tables"][a]["physical"])} {q(a)} ON {fld(model,a+"."+r["fromColumn"])}={fld(model,b+"."+r["toColumn"])}');joined.add(a);progress=True
        if not progress:raise ValueError('No relationship path for '+str(needed-joined))
    sel=[];groups=[];override_fields=set()
    for d in dims:
        x=fld(model,d);sel.append(f'{x} AS {q(d)}');groups.append(x)
    for m in meas:
        msql,mover=measure(m,model,context_filters=req.get('filters',[]),with_meta=True)
        override_fields.update(mover)
        sel.append(f'{msql} AS {q(m)}')
    bt=model['tables'][base];sql=f'SELECT {", ".join(sel)} FROM {q(bt["physical"])} {q(base)}'
    if joins:sql+=' '+' '.join(joins)
    wh=[];params=[]
    for f in req.get('filters',[]):
        if f.get('field') in override_fields:
            continue
        op=f.get('operator','equals'); field_sql=fld(model,f['field']); val=f.get('value')
        ops={'equals':'=','not_equals':'<>','gt':'>','gte':'>=','lt':'<','lte':'<='}
        if op=='contains':
            wh.append(field_sql+' LIKE ?');params.append('%'+str(val)+'%')
        elif op=='between' and isinstance(val,(list,tuple)) and len(val)==2:
            wh.append(field_sql+' BETWEEN ? AND ?');params.extend([val[0],val[1]])
        elif op in ops:
            wh.append(field_sql+' '+ops[op]+' ?');params.append(val)
        else:
            raise ValueError('Unsupported filter operator: '+str(op))
    for r in rls:
        field_sql=fld(model,r['table']+'.'+r['column']); op=r.get('operator','equals'); val=r.get('value')
        ops={'equals':'=','not_equals':'<>','gt':'>','gte':'>=','lt':'<','lte':'<='}
        if op=='contains':
            wh.append(field_sql+' LIKE ?');params.append('%'+str(val)+'%')
        elif op=='in':
            vals=val if isinstance(val,(list,tuple)) else [x.strip() for x in str(val).split(',') if x.strip()]
            if not vals:
                wh.append('1=0')
            else:
                wh.append(field_sql+' IN ('+','.join('?' for _ in vals)+')');params.extend(vals)
        elif op in ops:
            wh.append(field_sql+' '+ops[op]+' ?');params.append(val)
        else:
            raise ValueError('Unsupported RLS operator: '+str(op))
    if wh:sql+=' WHERE '+' AND '.join(wh)
    if groups:sql+=' GROUP BY '+', '.join(groups)
    if dims and 'Month Name' in dims[0] and 'Date.Month' in model['tables']['Date']['columns']:
        pass
    sort=req.get('sort',[])
    if sort:sql+=' ORDER BY '+', '.join(q(x['field'])+' '+('DESC' if x.get('direction')=='desc' else 'ASC') for x in sort)
    sql+=' LIMIT '+str(min(int(req.get('limit',200)),2000));return sql,params

_CACHE=OrderedDict()
_CACHE_LOCK=threading.Lock()
_CACHE_HITS=0
_CACHE_MISSES=0
_CACHE_MAX=256
_CACHE_TTL=45.0

def _cache_key(model,req,rls):
    payload=json.dumps({'model':model,'req':req,'rls':list(rls)},sort_keys=True,separators=(',',':'),default=str)
    return hashlib.sha256(payload.encode()).hexdigest()

def cache_stats():
    with _CACHE_LOCK:
        return {'entries':len(_CACHE),'hits':_CACHE_HITS,'misses':_CACHE_MISSES,'ttlSeconds':_CACHE_TTL,'maxEntries':_CACHE_MAX}

def clear_cache():
    with _CACHE_LOCK:_CACHE.clear()

def execute(model,req,rls=()):
    global _CACHE_HITS,_CACHE_MISSES
    key=_cache_key(model,req,rls);now=time.time()
    with _CACHE_LOCK:
        hit=_CACHE.get(key)
        if hit and now-hit[0]<_CACHE_TTL:
            _CACHE.move_to_end(key);_CACHE_HITS+=1
            return hit[1],hit[2]
        _CACHE_MISSES+=1
    sql,p=compile_query(model,req,rls);c=connect()
    try:
        from .local_engine import _sql_string
        for t_name, t_def in model.get('tables', {}).items():
            source_url = t_def.get('sourceUrl')
            if source_url:
                c.execute(f"CREATE OR REPLACE VIEW {_sql_string(t_name)} AS SELECT * FROM read_parquet({_sql_string(source_url)})")
                
        cur=c.execute(sql,p);cols=[d[0] for d in cur.description]
        rows=[dict(zip(cols,r)) for r in cur.fetchall()]
    finally:c.close()
    with _CACHE_LOCK:
        _CACHE[key]=(now,rows,sql);_CACHE.move_to_end(key)
        while len(_CACHE)>_CACHE_MAX:_CACHE.popitem(last=False)
    return rows,sql
