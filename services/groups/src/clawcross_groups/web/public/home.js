(() => {
  const base = new URL('.', location.href).pathname.replace(/\/$/, '');
  const el=id=>document.getElementById(id);
  fetch(base+'/site/config').then(response=>response.json()).then(config=>{
    if(config.hub_url){el('hub-home').href=config.hub_url;el('hub-home').hidden=false;}
  }).catch(()=>{});
  let owned=[];try{owned=JSON.parse(localStorage.getItem('group-owned')||'[]');}catch(_){}
  function list(){el('owned').hidden=!owned.length;el('owned-list').replaceChildren(...owned.map(group=>{const a=document.createElement('a');a.href=group.path;a.textContent=group.title;return a;}));}
  list();
  el('create').onsubmit=async event=>{
    event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;el('status').textContent='正在创建…';
    try{
      const response=await fetch(base+'/site/groups',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:el('title').value.trim()})});
      const data=await response.json();if(!response.ok)throw Error(typeof data.detail==='string'?data.detail:'创建失败，请检查群名');
      const ticket=data.path.split('#')[1],saved=JSON.stringify({token:data.token,name:data.name});
      localStorage.setItem('group-guest:'+ticket,saved);localStorage.setItem('group-guest-identity:'+data.identity_key,saved);
      owned.unshift({id:data.group_id,title:data.title,path:data.path});localStorage.setItem('group-owned',JSON.stringify(owned));list();
      el('group-title').textContent=data.title;el('link').value=new URL(data.path,location.origin).href;el('open').href=data.path;el('created').hidden=false;el('status').textContent='群聊已创建，消息会保存在群服务器。';
      const qr=await fetch(base+'/site/qr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:el('link').value})});
      if(qr.ok){el('qr').src=(await qr.json()).qr;el('qr').hidden=false;}
    }catch(error){el('status').textContent=error.message;el('status').classList.add('error');}finally{button.disabled=false;}
  };
  el('copy').onclick=async()=>{try{await navigator.clipboard.writeText(el('link').value);el('status').textContent='邀请已复制';}catch(_){el('link').select();el('status').textContent='请复制已选中的邀请链接';}};
})();
