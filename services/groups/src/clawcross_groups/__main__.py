"""Public and administrator listeners share a store, with independent applications."""
import argparse
import multiprocessing
import os
from pathlib import Path

import uvicorn
from .app import Settings, create_public_app, create_admin_app


def admin_worker(settings):
    uvicorn.run(create_admin_app(settings),host='127.0.0.1',port=settings.admin_port,proxy_headers=False)


def main():
    parser=argparse.ArgumentParser(description='ClawCross Groups：独立群聊网站，不包含 Agent 后端')
    parser.add_argument('--host',default=os.getenv('GROUPS_HOST','127.0.0.1'))
    parser.add_argument('--port',type=int,default=int(os.getenv('GROUPS_PORT','51310')))
    parser.add_argument('--admin-port',type=int,default=int(os.getenv('GROUPS_ADMIN_PORT','51311')))
    parser.add_argument('--data-dir',type=Path,default=Path(os.getenv('GROUPS_DATA_DIR',str(Path.home()/'.clawcross-groups'))))
    parser.add_argument('--public-url',default=os.getenv('GROUPS_PUBLIC_URL',''))
    parser.add_argument('--max-groups',type=int,default=int(os.getenv('GROUPS_MAX_GROUPS','1000')))
    parser.add_argument('--hub-url',default=os.getenv('GROUPS_HUB_URL',''))
    args=parser.parse_args()
    if args.port==args.admin_port or not all(1<=port<=65535 for port in (args.port,args.admin_port)) or args.max_groups<1:
        parser.error('端口需要有效且不同，群上限必须大于 0')
    settings=Settings(args.data_dir.resolve(),args.public_url.rstrip('/'),args.admin_port,args.max_groups,hub_url=args.hub_url)
    public=create_public_app(settings)  # Complete the persisted signing key before starting the second process.
    process=multiprocessing.get_context('spawn').Process(target=admin_worker,args=(settings,))
    process.start()
    print(f'群聊网站：http://127.0.0.1:{args.port}',flush=True)
    print(f'本机管理：http://127.0.0.1:{args.admin_port} （不要反向代理此端口）',flush=True)
    try:
        uvicorn.run(public,host=args.host,port=args.port,proxy_headers=True,forwarded_allow_ips='127.0.0.1',
                    ws_max_size=2*1024*1024,limit_concurrency=256)
    finally:
        process.terminate();process.join(timeout=10)
        if process.is_alive():process.kill();process.join()


if __name__=='__main__':main()
