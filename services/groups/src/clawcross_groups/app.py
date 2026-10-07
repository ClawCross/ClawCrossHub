"""Two independent HTTP applications: public groups and loopback-only operations."""
from __future__ import annotations

import asyncio
import base64
from collections import defaultdict, deque
from dataclasses import dataclass
import hashlib
import hmac
import os
from pathlib import Path
import secrets
import time
from urllib.parse import urlsplit

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel, ConfigDict, Field
import qrcode

from .protocol import relay_router, GuestJoin, GuestPost, GuestName, GuestPassword
from .store import RelayStore, RelayError, digest

WEB = Path(__file__).parent / 'web'


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    public_url: str = ''
    admin_port: int = 51311
    max_groups: int = 1000
    hub_url: str = ''

    @property
    def base_path(self) -> str:
        return urlsplit(self.public_url).path.rstrip('/')

    @property
    def public_origin(self) -> str:
        parsed = urlsplit(self.public_url)
        return f'{parsed.scheme}://{parsed.netloc}' if parsed.netloc else ''


class CreateGroup(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=160)


class BrowserJoin(GuestName):
    password: str = Field(min_length=6, max_length=128)


def signing_secret(directory: Path) -> str:
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = directory / 'signing.key'
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        secret = path.read_text().strip()
        if len(secret) < 32:
            raise RuntimeError('signing.key is incomplete')
        return secret
    with os.fdopen(fd, 'w') as file:
        secret = secrets.token_urlsafe(48)
        file.write(secret)
    return secret


class Site:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.store = RelayStore(settings.data_dir / 'groups.sqlite3')
        self.signer = URLSafeTimedSerializer(signing_secret(settings.data_dir), salt='group-human-invite-v1')
        self.csrf = secrets.token_urlsafe(32)
        self.rate = defaultdict(deque)
        self.create_lock = asyncio.Lock()

    def limited(self, key: str, maximum: int, seconds: int = 60):
        now = time.monotonic()
        queue = self.rate[key]
        while queue and queue[0] < now - seconds:
            queue.popleft()
        if len(queue) >= maximum:
            raise HTTPException(429, '操作太频繁，请稍后再试')
        queue.append(now)
        if len(self.rate) > 4096:
            for old in list(self.rate):
                if not self.rate[old] or self.rate[old][-1] < now - 3600:
                    self.rate.pop(old, None)
            while len(self.rate) > 4096:
                self.rate.pop(next(iter(self.rate)))

    def invitation(self, ticket: str, *, joining: bool = False) -> str:
        if not ticket or len(ticket) > 4096:
            raise HTTPException(403, '邀请链接无效')
        try:
            data = self.signer.loads(ticket, max_age=30 * 86400 if joining else None)
            invite = data['invite']
            if not isinstance(invite, str) or len(invite) > 100:
                raise ValueError()
            return invite
        except (BadSignature, KeyError, ValueError, TypeError):
            raise HTTPException(403, '邀请链接无效或已过期')

    def link(self, invite: str) -> str:
        ticket = self.signer.dumps({'invite': invite})
        return self.settings.base_path + '/group-guest#' + ticket

    @staticmethod
    def identity(gid: str) -> str:
        return hashlib.sha256(gid.encode()).hexdigest()

    def browser_state(self, credential: str, after: int) -> dict:
        state = self.store.guest_state(credential, after, allow_member=True)
        state['identity_key'] = self.identity(state['group_id'])
        return state


def base_app(site: Site, *, admin: bool) -> FastAPI:
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    app.state.site = site

    @app.exception_handler(RelayError)
    async def relay_error(request, error):
        return JSONResponse({'detail': str(error)}, status_code=error.status)

    @app.middleware('http')
    async def boundaries(request: Request, call_next):
        host = urlsplit('http://' + request.headers.get('host', ''))
        origin = request.headers.get('origin')
        if admin:
            proxy = any(name in request.headers for name in ('forwarded', 'x-forwarded-for', 'x-forwarded-host', 'x-forwarded-proto'))
            try:
                local_host = host.hostname == '127.0.0.1' and host.port == site.settings.admin_port
            except ValueError:
                local_host = False
            allowed_origin = f'http://127.0.0.1:{site.settings.admin_port}'
            if (not request.client or request.client.host != '127.0.0.1' or not local_host or proxy
                    or (origin and origin != allowed_origin) or request.headers.get('sec-fetch-site') == 'cross-site'):
                return JSONResponse({'detail': '管理页面只允许通过 127.0.0.1 直接访问'}, status_code=403)
            if request.method not in {'GET', 'HEAD'} and not hmac.compare_digest(request.headers.get('x-admin-csrf', ''), site.csrf):
                return JSONResponse({'detail': '缺少本机管理确认凭证'}, status_code=403)
        elif origin:
            permitted = {str(request.base_url).rstrip('/'), site.settings.public_origin}
            if origin not in permitted:
                return JSONResponse({'detail': '请求来源不匹配'}, status_code=403)
        size, chunks = 0, []
        async for chunk in request.stream():
            size += len(chunk)
            if size > 2 * 1024 * 1024:
                return JSONResponse({'detail': '请求超过 2 MiB'}, status_code=413)
            chunks.append(chunk)
        request._body = b''.join(chunks)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'"
        return response

    app.mount('/static', StaticFiles(directory=WEB / ('admin' if admin else 'public')), name='static')
    return app


async def call(fn, *args, **kwargs):
    return await asyncio.to_thread(fn, *args, **kwargs)


def guest_token(request: Request) -> str:
    token = request.headers.get('X-Guest-Token', '')
    if not token or len(token) > 100:
        raise HTTPException(401, '请先加入群聊')
    return token


def create_public_app(settings: Settings) -> FastAPI:
    site = Site(settings)
    app = base_app(site, admin=False)
    app.include_router(relay_router(site.store, site.invitation))

    @app.get('/')
    async def home():
        return FileResponse(WEB / 'public/home.html')

    @app.get('/group-guest')
    async def chat():
        return FileResponse(WEB / 'public/chat.html')

    @app.get('/site/config')
    async def config():
        return {'hub_url': settings.hub_url}

    @app.post('/site/groups')
    async def create(body: CreateGroup, request: Request):
        peer = request.client.host if request.client else '?'
        site.limited('create:' + peer, 10, 3600)
        site.limited('create:global', 60)
        async with site.create_lock:
            with site.store.db() as db:
                if db.execute('SELECT COUNT(*) FROM relay_groups').fetchone()[0] >= settings.max_groups:
                    raise HTTPException(503, '当前群数量已达到部署者设置的上限')
            created = await call(site.store.create, title=body.title, node_id='browser-' + secrets.token_hex(12),
                                 user_id='owner-' + secrets.token_hex(12), display_name='群主')
            invited = await call(site.store.guest_invite, created['token'])
        gid = created['group']['group_id']
        return {'group_id': gid, 'title': created['group']['title'], 'path': site.link(invited['invite']),
                'token': created['token'], 'name': '群主', 'identity_key': site.identity(gid)}

    @app.post('/site/qr')
    async def qr(body: dict, request: Request):
        site.limited('qr:' + (request.client.host if request.client else '?'), 30)
        link = body.get('url', '')
        if not isinstance(link, str) or len(link) > 6000:
            raise HTTPException(400, '邀请链接无效')
        parsed = urlsplit(link)
        allowed_hosts = {request.headers.get('host', ''), urlsplit(settings.public_url).netloc}
        if parsed.path != settings.base_path + '/group-guest' or parsed.scheme not in {'http', 'https'} or parsed.netloc not in allowed_hosts:
            raise HTTPException(400, '请使用本站邀请链接')
        site.invitation(parsed.fragment, joining=True)
        code = qrcode.QRCode(border=4); code.add_data(link); code.make(fit=True)
        matrix = code.get_matrix(); size = len(matrix)
        drawing = ''.join(f'M{x},{y}h1v1h-1z' for y,row in enumerate(matrix) for x,dark in enumerate(row) if dark)
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="240" height="240"><rect width="100%" height="100%" fill="white"/><path d="{drawing}" fill="black"/></svg>'
        return {'qr': 'data:image/svg+xml;base64,' + base64.b64encode(svg.encode()).decode()}

    @app.post('/group-guest-api/info')
    async def info(request: Request):
        site.limited('info:' + (request.client.host if request.client else '?'), 120)
        data = await call(site.store.guest_info, site.invitation(request.headers.get('X-Group-Invite', ''), joining=True))
        data['identity_key'] = site.identity(data['group_id'])
        return data

    @app.post('/group-guest-api/join')
    async def join(body: BrowserJoin, request: Request):
        invite = site.invitation(request.headers.get('X-Group-Invite', ''), joining=True)
        site.limited('guest-join:' + (request.client.host if request.client else '?'), 12)
        site.limited('guest-join:global', 120)
        return await call(site.store.guest_join, invite, body.name, body.password)

    @app.get('/group-guest-api/state')
    async def state(request: Request, after_id: int = -1):
        return await call(site.browser_state, guest_token(request), after_id)

    @app.post('/group-guest-api/messages')
    async def post(body: GuestPost, request: Request):
        credential = guest_token(request)
        site.limited('post:' + digest(credential), 60)
        message = await call(site.store.post, credential, **body.model_dump())
        return {'id': message['message']['id']}

    @app.get('/group-guest-api/search')
    async def search(request: Request, query: str, before_id: int = 0, limit: int = 50):
        credential = guest_token(request); site.limited('search:' + digest(credential), 60)
        return await call(site.store.search_messages, credential, query, max(0,before_id), limit)

    @app.post('/group-guest-api/rename')
    async def rename(body: GuestName, request: Request):
        credential = guest_token(request)
        with site.store.db() as db:
            conn = site.store.auth(db, credential)
            guest = bool(conn['guest'])
        if guest:
            return await call(site.store.guest_rename, credential, body.name)
        identity = site.browser_state(credential, 0)
        await call(site.store.manage, credential, 'member_patch', {'principal':identity['principal'], 'name':body.name})
        return {'name': body.name}

    @app.post('/group-guest-api/password')
    async def password(body: GuestPassword, request: Request):
        credential = guest_token(request); site.limited('password:' + digest(credential), 12)
        return await call(site.store.guest_set_password, credential, body.password)

    @app.post('/site/group/{action}')
    async def owner(action: str, body: dict, request: Request):
        credential = guest_token(request)
        group = await call(site.store.detail, credential)
        with site.store.db() as db:
            conn = site.store.auth(db, credential)
            if conn['id'] != group['owner']:
                raise HTTPException(403, '只有群主可以管理这个群')
        if action == 'invite':
            data = await call(site.store.guest_invite, credential)
            return {'path':site.link(data['invite']), 'group_id':group['group_id']}
        if action not in {'patch','remove_member','member_patch','primary','delete'}:
            raise HTTPException(400, '不支持的群操作')
        return await call(site.store.manage, credential, action, body)
    return app


def create_admin_app(settings: Settings) -> FastAPI:
    site = Site(settings)
    app = base_app(site, admin=True)

    @app.get('/')
    async def home():
        return FileResponse(WEB / 'admin/index.html')

    @app.get('/admin/api/state')
    async def state():
        groups = await call(site.store.admin_list)
        with site.store.db() as db:
            messages = db.execute("SELECT COUNT(*) FROM relay_events WHERE kind='message'").fetchone()[0]
        size = sum(p.stat().st_size for p in settings.data_dir.glob('groups.sqlite3*') if p.is_file())
        return {'groups':groups, 'messages':messages, 'storage_bytes':size, 'max_groups':settings.max_groups, 'csrf':site.csrf}

    @app.post('/admin/api/groups/{gid}/{action}')
    async def manage(gid: str, action: str, body: dict):
        if action == 'invite':
            data = await call(site.store.guest_invite, '', admin_group=gid)
            path = site.link(data['invite'])
            return {'path':path, 'url':settings.public_origin + path if settings.public_url else path}
        if action not in {'patch','remove_member','member_patch','primary','delete','disconnect_external','external_access'}:
            raise HTTPException(400, '不支持的管理操作')
        return await call(site.store.manage, '', action, body, admin_group=gid)
    return app
