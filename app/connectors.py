from __future__ import annotations
import io, json, re, tempfile, urllib.parse, urllib.request, ipaddress, socket
from pathlib import Path
import pandas as pd
from .local_engine import metadata as local_metadata, write_dataframe, import_path

def safe_table_name(name:str)->str:
    stem=Path(name).stem
    stem=re.sub(r'[^A-Za-z0-9_]+','_',stem).strip('_') or 'ImportedData'
    if stem[0].isdigit():stem='T_'+stem
    return 'Imported_'+stem[:70]

def demo_metadata():
    return local_metadata()

def import_file_path(filename:str,path:Path,sheet:str|None=None,source_bytes:int|None=None):
    ext=Path(filename).suffix.lower()
    table=safe_table_name(filename)
    if ext in ('.csv','.tsv','.txt','.json','.jsonl','.parquet'):
        rows=import_path(path,table,source_bytes)
        meta=next(x for x in local_metadata() if x['name']==table)
        return {'ok':True,'table':table,'rows':rows,'columns':[c['name'] for c in meta['columns']],'metadata':meta,'storage':meta.get('storage')}
    if ext in ('.xlsx','.xls'):
        engine='xlrd' if ext=='.xls' else 'openpyxl'
        df=pd.read_excel(path,sheet_name=sheet or 0,engine=engine)
        rows=write_dataframe(df,table,source_bytes or path.stat().st_size,'managed')
        meta=next(x for x in local_metadata() if x['name']==table)
        return {'ok':True,'table':table,'rows':rows,'columns':[str(c) for c in df.columns],'metadata':meta,'storage':meta.get('storage')}
    if ext=='.xml':
        df=pd.read_xml(path)
        rows=write_dataframe(df,table,source_bytes or path.stat().st_size,'managed')
        meta=next(x for x in local_metadata() if x['name']==table)
        return {'ok':True,'table':table,'rows':rows,'columns':[str(c) for c in df.columns],'metadata':meta,'storage':meta.get('storage')}
    raise ValueError('Supported file types are CSV, TSV/TXT, XLSX/XLS, JSON/JSONL, Parquet and XML.')

def import_file(filename:str,raw:bytes,sheet:str|None=None):
    suffix=Path(filename).suffix or '.csv'
    with tempfile.NamedTemporaryFile(delete=False,suffix=suffix) as f:
        f.write(raw);tmp=Path(f.name)
    try:return import_file_path(filename,tmp,sheet,len(raw))
    finally:
        try:tmp.unlink()
        except Exception:pass

def _google_sheet_csv(url:str):
    if '/spreadsheets/d/' in url:
        m=re.search(r'/spreadsheets/d/([^/]+)',url)
        sid=m.group(1) if m else None
        parsed=urllib.parse.urlparse(url);qs=urllib.parse.parse_qs(parsed.query)
        gid=qs.get('gid',['0'])[0]
        if sid:return f'https://docs.google.com/spreadsheets/d/{sid}/export?format=csv&gid={gid}'
    return url

def _validate_remote_url(url:str):
    """Block local/private-network SSRF by default for cloud/API imports."""
    parsed=urllib.parse.urlparse(url)
    if parsed.scheme not in ('https','http') or not parsed.hostname:
        raise ValueError('Only HTTP/HTTPS URLs are allowed.')
    if parsed.scheme!='https' and __import__('os').environ.get('VTAB_ALLOW_INSECURE_HTTP','0')!='1':
        raise ValueError('HTTPS is required for remote data sources. Set VTAB_ALLOW_INSECURE_HTTP=1 only for trusted development endpoints.')
    if __import__('os').environ.get('VTAB_ALLOW_PRIVATE_REMOTE','0')=='1':
        return
    try:
        infos=socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme=='https' else 80), type=socket.SOCK_STREAM)
        for info in infos:
            ip=ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
                raise ValueError('Private, loopback, link-local and reserved network destinations are blocked for remote imports.')
    except socket.gaierror as exc:
        raise ValueError(f'Could not resolve remote host: {exc}')

def import_cloud(source_type:str,url:str,name:str|None=None):
    if source_type=='google_sheets':url=_google_sheet_csv(url)
    _validate_remote_url(url)
    req=urllib.request.Request(url,headers={'User-Agent':'VTAB-Reporting-Studio/2.0'})
    with urllib.request.urlopen(req,timeout=60) as resp:
        ctype=(resp.headers.get('Content-Type') or '').lower()
        suffix='.json' if 'json' in ctype else '.csv'
        filename=name or ('GoogleSheet'+suffix if source_type=='google_sheets' else 'CloudData'+suffix)
        if not Path(filename).suffix:filename+=suffix
        with tempfile.NamedTemporaryFile(delete=False,suffix=suffix) as f:
            total=0
            while True:
                chunk=resp.read(8*1024*1024)
                if not chunk:break
                f.write(chunk);total+=len(chunk)
            tmp=Path(f.name)
    try:return import_file_path(filename,tmp,None,total)
    finally:
        try:tmp.unlink()
        except Exception:pass

def _optional_import(module:str, package_hint:str):
    try:
        return __import__(module)
    except Exception as exc:
        raise ValueError(f"Connector driver is not installed. Install/configure {package_hint}. Details: {exc}")

def test_connection(payload):
    typ=payload.get('type')
    cfg=payload.get('config') or {}
    if typ=='demo':return {'ok':True,'message':'Local DuckDB columnar workspace is ready.'}
    if typ=='postgresql':
        import psycopg
        with psycopg.connect(host=cfg['host'],port=cfg.get('port',5432),dbname=cfg['database'],user=cfg['user'],password=cfg['password'],connect_timeout=8) as c:
            with c.cursor() as cur:cur.execute('SELECT 1');cur.fetchone()
        return {'ok':True,'message':'PostgreSQL connection successful.'}
    if typ=='sqlserver':
        import pyodbc
        driver=cfg.get('driver','ODBC Driver 18 for SQL Server')
        cs=f'DRIVER={{{driver}}};SERVER={cfg["server"]};DATABASE={cfg["database"]};UID={cfg["user"]};PWD={cfg["password"]};TrustServerCertificate=no;Encrypt=yes'
        c=pyodbc.connect(cs,timeout=8);c.execute('SELECT 1').fetchone();c.close()
        return {'ok':True,'message':'SQL Server connection successful with encrypted transport.'}
    if typ in ('odbc','access','oracle','db2','mysql','mariadb','snowflake','databricks','redshift','bigquery','synapse','fabric_warehouse'):
        # Generic enterprise connector validation. Native drivers/plugins are optional and kept out of the core runtime.
        if typ=='odbc':
            import pyodbc
            cs=cfg.get('connectionString')
            if not cs: raise ValueError('ODBC connectionString is required.')
            c=pyodbc.connect(cs,timeout=8);c.execute('SELECT 1').fetchone();c.close()
            return {'ok':True,'message':'ODBC connection successful.'}
        required={
          'mysql':'pymysql','mariadb':'pymysql','oracle':'oracledb','snowflake':'snowflake.connector',
          'databricks':'databricks.sql','bigquery':'google.cloud.bigquery','db2':'ibm_db_dbi'
        }
        mod=required.get(typ)
        if mod:
            try:
                __import__(mod.split('.')[0])
            except Exception:
                return {'ok':False,'driverRequired':True,'message':f'{typ} connector is available in VTAB, but its optional vendor driver/plugin must be installed on the build/runtime machine.'}
        # Synapse/Fabric/Redshift can use SQL Server/PostgreSQL/ODBC compatible drivers.
        return {'ok':True,'configurationOnly':True,'message':f'{typ} connector definition is valid. Use the vendor driver/ODBC authentication configured for your environment.'}
    if typ in ('sharepoint','onedrive','google_sheets','azure_blob','adls_gen2','s3','gcs','rest','odata','graphql','salesforce','dynamics365','servicenow','jira','github'):
        url=cfg.get('url','') or cfg.get('endpoint','')
        if not url:raise ValueError('An HTTPS endpoint/shared/export URL is required.')
        _validate_remote_url(url)
        return {'ok':True,'message':'Secure endpoint configuration accepted. Authentication is validated when the connector executes.'}
    if typ=='sqlite':
        import sqlite3
        path=cfg.get('path')
        if not path:raise ValueError('SQLite database path is required.')
        c=sqlite3.connect(path);c.execute('SELECT 1').fetchone();c.close();return {'ok':True,'message':'SQLite connection successful.'}
    raise ValueError('Unsupported connector')

SOURCE_CATALOG=[
 # Databases
 {'id':'sqlserver','name':'SQL Server / Azure SQL','category':'Database','mode':'DirectQuery / Import','status':'native'},
 {'id':'postgresql','name':'PostgreSQL','category':'Database','mode':'DirectQuery / Import','status':'native'},
 {'id':'mysql','name':'MySQL','category':'Database','mode':'DirectQuery / Import','status':'plugin'},
 {'id':'mariadb','name':'MariaDB','category':'Database','mode':'DirectQuery / Import','status':'plugin'},
 {'id':'oracle','name':'Oracle Database','category':'Database','mode':'DirectQuery / Import','status':'plugin'},
 {'id':'db2','name':'IBM Db2','category':'Database','mode':'DirectQuery / Import','status':'plugin'},
 {'id':'sqlite','name':'SQLite','category':'Database','mode':'Import','status':'native'},
 {'id':'access','name':'Microsoft Access','category':'Database','mode':'ODBC Import','status':'driver'},
 {'id':'odbc','name':'ODBC','category':'Database','mode':'DirectQuery / Import','status':'driver'},
 {'id':'jdbc','name':'JDBC','category':'Database','mode':'Import','status':'driver'},
 # Warehouses / lakehouses
 {'id':'snowflake','name':'Snowflake','category':'Cloud Warehouse','mode':'DirectQuery / Import','status':'plugin'},
 {'id':'databricks','name':'Databricks SQL / Lakehouse','category':'Cloud Warehouse','mode':'DirectQuery / Import','status':'plugin'},
 {'id':'bigquery','name':'Google BigQuery','category':'Cloud Warehouse','mode':'DirectQuery / Import','status':'plugin'},
 {'id':'redshift','name':'Amazon Redshift','category':'Cloud Warehouse','mode':'DirectQuery / Import','status':'driver'},
 {'id':'synapse','name':'Azure Synapse Analytics','category':'Cloud Warehouse','mode':'DirectQuery / Import','status':'driver'},
 {'id':'fabric_warehouse','name':'Microsoft Fabric Warehouse / Lakehouse','category':'Cloud Warehouse','mode':'DirectQuery / Import','status':'driver'},
 # Files
 {'id':'csv','name':'CSV','category':'File','mode':'Columnar Import','status':'native'},
 {'id':'tsv','name':'Text / TSV','category':'File','mode':'Columnar Import','status':'native'},
 {'id':'excel','name':'Excel (XLSX/XLS)','category':'File','mode':'Columnar Import','status':'native'},
 {'id':'json','name':'JSON / JSONL','category':'File','mode':'Columnar Import','status':'native'},
 {'id':'parquet','name':'Parquet','category':'File','mode':'Zero-copy / Import','status':'native'},
 {'id':'xml','name':'XML','category':'File','mode':'Import','status':'native'},
 {'id':'folder','name':'Folder / Append','category':'File','mode':'Batch Import','status':'native'},
 # Cloud storage/files
 {'id':'sharepoint','name':'SharePoint','category':'Cloud Storage','mode':'Import','status':'native'},
 {'id':'onedrive','name':'OneDrive','category':'Cloud Storage','mode':'Import','status':'native'},
 {'id':'google_sheets','name':'Google Sheets','category':'Cloud Storage','mode':'Import','status':'native'},
 {'id':'azure_blob','name':'Azure Blob Storage','category':'Cloud Storage','mode':'Import','status':'endpoint'},
 {'id':'adls_gen2','name':'Azure Data Lake Storage Gen2','category':'Cloud Storage','mode':'Import','status':'endpoint'},
 {'id':'s3','name':'Amazon S3','category':'Cloud Storage','mode':'Import','status':'endpoint'},
 {'id':'gcs','name':'Google Cloud Storage','category':'Cloud Storage','mode':'Import','status':'endpoint'},
 # APIs / SaaS
 {'id':'rest','name':'REST API','category':'API / SaaS','mode':'Import / Refresh','status':'native'},
 {'id':'odata','name':'OData Feed','category':'API / SaaS','mode':'Import / Refresh','status':'native'},
 {'id':'graphql','name':'GraphQL API','category':'API / SaaS','mode':'Import / Refresh','status':'endpoint'},
 {'id':'salesforce','name':'Salesforce','category':'API / SaaS','mode':'Import / Refresh','status':'plugin'},
 {'id':'dynamics365','name':'Dynamics 365 / Dataverse','category':'API / SaaS','mode':'Import / Refresh','status':'plugin'},
 {'id':'servicenow','name':'ServiceNow','category':'API / SaaS','mode':'Import / Refresh','status':'plugin'},
 {'id':'jira','name':'Jira','category':'API / SaaS','mode':'Import / Refresh','status':'plugin'},
 {'id':'github','name':'GitHub','category':'API / SaaS','mode':'Import / Refresh','status':'plugin'},
]
