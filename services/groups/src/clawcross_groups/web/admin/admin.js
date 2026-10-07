(() => {
  const el=id=>document.getElementById(id);let csrf='';
  const button=(label,fn,danger=false)=>{const b=document.createElement('button');b.textContent=label;b.type='button';if(danger)b.className='danger';b.onclick=fn;return b;};
  async function change(group,action,body){
    try{const response=await fetch('/admin/api/groups/'+encodeURIComponent(group.group_id)+'/'+action,{method:'POST',headers:{'Content-Type':'application/json','X-Admin-CSRF':csrf},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw Error(data.detail||'操作失败');if(action==='invite')prompt('新邀请（旧链接不再允许加入）',data.url);await load();}catch(error){el('status').textContent=error.message;el('status').className='error';}
  }
  async function load(){
    try{const response=await fetch('/admin/api/state');const data=await response.json();if(!response.ok)throw Error(data.detail||'无法读取');csrf=data.csrf;
      el('stats').textContent=`${data.groups.length} / ${data.max_groups} 个群 · ${data.messages} 条消息 · ${(data.storage_bytes/1048576).toFixed(2)} MiB 存储`;el('groups').replaceChildren();
      for(const group of data.groups){const card=document.createElement('article');card.className='group';const title=document.createElement('h2');title.textContent=group.title;
        const id=document.createElement('small');id.textContent=group.group_id+' · '+group.member_count+' 位成员';card.append(title,id);
        const actions=document.createElement('div');actions.className='actions';actions.append(
          button('改群名',()=>{const name=prompt('新的群名',group.title);if(name?.trim())void change(group,'patch',{title:name.trim()});}),
          button('更新邀请',()=>void change(group,'invite',{})),
          button(group.external_access_enabled?'暂停外部连接':'恢复外部连接',()=>void change(group,'external_access',{enabled:!group.external_access_enabled})),
          button('删除群',()=>{if(confirm('删除「'+group.title+'」及其聊天记录？'))void change(group,'delete',{});},true));card.append(actions);
        const members=document.createElement('div');members.className='members';for(const member of group.members){const row=document.createElement('div');row.className='member';const name=document.createElement('span');name.textContent=member.name;
          const kind=document.createElement('small');kind.textContent=member.is_agent?member.platform+' · Agent':member.connection_id===group.owner?'群主':'人类';row.append(name,kind);
          if(member.is_agent || member.connection_id!==group.owner)row.append(button('移除',()=>{if(confirm('移除 '+member.name+'？'))void change(group,'remove_member',{principal:member.principal});},true));members.append(row);}
        card.append(members);el('groups').append(card);
      }el('status').textContent='已更新';el('status').className='';
    }catch(error){el('status').textContent=error.message;el('status').className='error';}
  }
  el('refresh').onclick=load;void load();
})();
