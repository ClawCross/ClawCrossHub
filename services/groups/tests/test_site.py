from pathlib import Path
from urllib.parse import urlsplit
import sys

import pytest
from fastapi.testclient import TestClient

from clawcross_groups.app import Settings, create_public_app, create_admin_app


@pytest.fixture
def site(tmp_path):
    settings=Settings(tmp_path,'https://groups.example',admin_port=51311)
    app=create_public_app(settings)
    with TestClient(app,base_url='https://groups.example') as public:
        created=public.post('/site/groups',json={'title':'Friends'}).json()
        yield settings,app,public,created


def guest(public,created,name='Bob',password='password-123'):
    ticket=urlsplit(created['path']).fragment
    response=public.post('/group-guest-api/join',headers={'X-Group-Invite':ticket},json={'name':name,'password':password})
    assert response.status_code==200,response.text
    return response.json()['token']


def test_create_browser_chat_and_owner_scope(site):
    settings,app,public,created=site
    assert created['path'].startswith('/group-guest#')
    assert public.get('/').status_code==200 and public.get('/group-guest').status_code==200
    qr=public.post('/site/qr',json={'url':'https://groups.example'+created['path']})
    assert qr.status_code==200 and qr.json()['qr'].startswith('data:image/svg+xml;base64,')
    ticket=urlsplit(created['path']).fragment
    assert public.post('/group-guest-api/info',headers={'X-Group-Invite':ticket},json={}).json()['group_id']==created['group_id']
    bob=guest(public,created)
    own={'X-Guest-Token':created['token']};other={'X-Guest-Token':bob}
    assert public.get('/group-guest-api/state',headers=own).json()['is_owner'] is True
    assert public.get('/group-guest-api/state',headers=other).json()['is_owner'] is False
    response=public.post('/group-guest-api/messages',headers=other,json={'content':'Hello <script>alert(1)</script>','client_msg_id':'same'})
    assert response.status_code==200
    same=public.post('/group-guest-api/messages',headers=other,json={'content':'Hello <script>alert(1)</script>','client_msg_id':'same'})
    assert same.json()['id']==response.json()['id']
    assert len(public.get('/group-guest-api/state',headers=own).json()['messages'])==1
    assert public.post('/site/group/patch',headers=other,json={'title':'Stolen'}).status_code==403
    assert public.post('/site/group/patch',headers=own,json={'title':'Renamed'}).status_code==200
    assert public.get('/group-guest-api/state',headers=other).json()['title']=='Renamed'
    assert not any(name=='agents' or name.startswith(('webot','langchain')) for name in sys.modules)


def test_identity_password_restore_and_expired_invitation_rotation(site):
    _,_,public,created=site
    first=guest(public,created)
    ticket=urlsplit(created['path']).fragment
    assert public.post('/group-guest-api/join',headers={'X-Group-Invite':ticket},json={'name':'Bob','password':'wrong-secret'}).status_code==403
    assert public.post('/group-guest-api/join',headers={'X-Group-Invite':ticket},json={'name':'Bob'}).status_code==422
    second=guest(public,created)
    headers={'X-Guest-Token':second}
    assert len(public.get('/group-guest-api/state',headers=headers).json()['members'])==2
    newer=public.post('/site/group/invite',headers={'X-Guest-Token':created['token']},json={}).json()
    assert public.post('/group-guest-api/info',headers={'X-Group-Invite':ticket},json={}).status_code==403
    assert public.get('/group-guest-api/state',headers=headers).status_code==200
    assert public.post('/group-guest-api/info',headers={'X-Group-Invite':urlsplit(newer['path']).fragment},json={}).status_code==200


def test_clawcross_device_protocol_agent_mentions_offline_backlog_and_restart(site):
    settings,app,public,created=site
    ticket=urlsplit(created['path']).fragment
    response=public.post('/relay/join',headers={'X-Group-Invite':ticket},json={'node_id':'desktop','user_id':'alice','display_name':'Alice'})
    assert response.status_code==200,response.text
    connection=response.json();headers={'Authorization':'Bearer '+connection['token'],'X-Group-Invite':ticket}
    added=public.post('/relay/agents',headers=headers,json={'agent_id':'helper','name':'Helper','platform':'webot'}).json()
    principal=next(member['principal'] for member in added['members'] if member['agent_id']=='helper')
    bob=guest(public,created)
    assert public.post('/group-guest-api/messages',headers={'X-Guest-Token':bob},json={'content':'@Helper please reply','mentions':[principal]}).status_code==200
    packet=public.post('/relay/poll',headers=headers,json={'cursor':0}).json()
    messages=[event for event in packet['events'] if event['kind']=='message']
    assert principal in messages[-1]['targets']
    reply=public.post('/relay/messages',headers=headers,json={'agent_id':'helper','content':'Done','client_msg_id':'reply'})
    assert reply.status_code==200
    assert public.post('/relay/messages',headers=headers,json={'agent_id':'not-joined','content':'No'}).status_code==403
    with TestClient(create_public_app(settings),base_url='https://groups.example') as restarted:
        packet=restarted.post('/relay/poll',headers=headers,json={'cursor':0}).json()
        assert [event['message']['content'] for event in packet['events'] if event['kind']=='message']==['@Helper please reply','Done']
        with restarted.websocket_connect('/relay/ws') as ws:
            ws.send_json({'token':connection['token'],'cursor':0})
            assert ws.receive_json()['type']=='events'


def test_administrator_is_absent_from_public_listener_and_remote_access_is_rejected(site):
    settings,_,public,created=site
    for path in ('/admin/api/state','/relay/admin/groups','/relay/create','/relay/host-local','/static/index.html','/static/admin.js'):
        assert public.get(path).status_code in {404,405}
    admin=create_admin_app(settings)
    with TestClient(admin,base_url='http://127.0.0.1:51311',client=('198.51.100.7',1234)) as remote:
        assert remote.get('/').status_code==403
        assert remote.get('/admin/api/state',headers={'X-Forwarded-For':'127.0.0.1'}).status_code==403
    with TestClient(admin,base_url='http://127.0.0.1:51311',client=('127.0.0.1',1234)) as local:
        assert local.get('/').status_code==200
        for headers in ({'Host':'evil.example'},{'X-Forwarded-For':'198.51.100.7'},{'Origin':'https://evil.example'},{'Sec-Fetch-Site':'cross-site'}):
            assert local.get('/admin/api/state',headers=headers).status_code==403
        state=local.get('/admin/api/state').json()
        assert len(state['groups'])==1 and state['storage_bytes']>0
        path='/admin/api/groups/'+created['group_id']+'/patch'
        assert local.post(path,json={'title':'No'}).status_code==403
        assert local.post(path,headers={'X-Admin-CSRF':state['csrf']},json={'title':'Managed'}).status_code==200
        assert local.get('/admin/api/state').json()['groups'][0]['title']=='Managed'


def test_site_origin_and_capacity_limit(tmp_path):
    app=create_public_app(Settings(tmp_path,'https://groups.example',max_groups=1))
    with TestClient(app,base_url='https://groups.example') as client:
        assert client.post('/site/groups',headers={'Origin':'https://evil.example'},json={'title':'No'}).status_code==403
        assert client.post('/site/groups',json={'title':'One'}).status_code==200
        assert client.post('/site/groups',json={'title':'Two'}).status_code==503
