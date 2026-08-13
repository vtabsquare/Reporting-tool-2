from __future__ import annotations
import os
from pathlib import Path
import duckdb
import uvicorn

def _load_env():
    """Load .env file from apps/api directory into os.environ."""
    env_path = Path(__file__).parent / '.env'
    if not env_path.exists():
        return
    try:
        with open(env_path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                key, _, value = line.partition('=')
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except Exception as exc:
        print(f'[VTAB] Warning: could not load .env: {exc}')

if __name__ == '__main__':
    _load_env()
    duckdb.__version__
    os.environ.setdefault('VTAB_ENFORCE_API_AUTH','1')
    os.environ.setdefault('VTAB_DESKTOP_MODE','1')
    port=int(os.environ.get('VTAB_API_PORT','8820'))
    from app.server import app
    uvicorn.run(app, host='127.0.0.1', port=port, log_level='warning', access_log=False)
