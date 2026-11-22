// Media and presence views extend the existing Mission Control.
function readMediaRequirements() {
 const result={};for(const key of ['type','title','purpose','audience','platform','style','language','duration','aspectRatio']){const value=document.querySelector('#media-'+key).value;if(value!=='')result[key]=key==='duration'?Number(value):value;}return result;
}
function setupMediaUI(){
 const mode=document.querySelector('#missionMode');mode.append(makeOption('MEDIA','Media'));
 const options=document.createElement('details');options.id='mediaOptions';options.hidden=true;const summary=document.createElement('summary');summary.textContent='Media requirements';options.append(summary);
 const fields={type:['MEDIA_PACKAGE','IMAGE','VIDEO','AUDIO'],title:180,purpose:500,audience:120,platform:['INTERNAL','WEB','PRESENTATION','SOCIAL_DRAFT'],style:['PROFESSIONAL','MINIMAL','EDUCATIONAL'],language:['English','Filipino','Taglish'],duration:180,aspectRatio:['16:9','9:16','1:1']};
 for(const [key,values]of Object.entries(fields)){const label=document.createElement('label');label.textContent=key;const input=document.createElement(Array.isArray(values)?'select':'input');input.id='media-'+key;if(Array.isArray(values))for(const v of values)input.append(makeOption(v,v));else if(key==='duration'){input.type='number';input.min=1;input.max=180;input.value=10;}else input.maxLength=values;label.append(input);options.append(label);}
 document.querySelector('#documentOptions').insertAdjacentElement('afterend',options);mode.addEventListener('change',()=>{options.hidden=mode.value!=='MEDIA';});
 const panel=document.createElement('section');panel.id='mediaPanel';panel.hidden=true;document.querySelector('#documentPanel').insertAdjacentElement('afterend',panel);
 const presence=document.createElement('section');presence.id='agentPresence';const title=document.createElement('h3');title.textContent='Agent presence · current session';const button=document.createElement('button');button.type='button';button.textContent='Refresh presence';button.onclick=()=>refreshPresence().catch(()=>{});const list=document.createElement('ul');list.id='presenceList';presence.append(title,button,list);document.querySelector('#missionControl').append(presence);
}
async function refreshPresence(){
 const list=document.querySelector('#presenceList');list.replaceChildren();if(!selectedProjectId)return;
 const projectId=selectedProjectId,data=await request('/api/projects/'+encodeURIComponent(projectId)+'/agent-presence');if(projectId!==selectedProjectId)return;
 for(const r of data.records){const li=document.createElement('li');li.textContent=r.departmentId+' · '+r.displayName+' · '+r.status+' · '+r.activityLabel;list.append(li);}
}
async function showMedia(run,mission){
 const panel=document.querySelector('#mediaPanel');panel.replaceChildren();panel.hidden=mission.mode!=='MEDIA';if(panel.hidden)return;
 const data=await request('/api/mission-runs/'+encodeURIComponent(run.id)+'/media?projectId='+encodeURIComponent(mission.projectId));
 const add=(tag,value)=>{const n=document.createElement(tag);n.textContent=value;panel.append(n);return n;};
 add('h3','Media package · no composed MP4');const m=data.media||{};
 for(const [key,label]of Object.entries({specification:'Specification',creative:'Creative direction',script:'Script (draft until final approval)',storyboard:'Scene cards',shots:'Shot plan',assetPlan:'Asset plan',assembly:'Assembly plan',review:'Consistency review',feedback:'Critic feedback',qa:'Deterministic QA',manifest:'Manifest'})){if(m[key]){add('h4',label);add('pre',JSON.stringify(m[key],null,2));}}
 const providers=await request('/api/media/providers');add('h4','Provider status');add('pre',providers.providers.length ? JSON.stringify(providers.providers,null,2) : 'NOT_CONFIGURED: no media provider enabled');
 if (['RUNNING','WAITING_APPROVAL'].includes(run.status)) { const cancel=add('button','Cancel media mission'); cancel.type='button'; cancel.onclick=async()=>{ await request('/api/missions/'+encodeURIComponent(mission.id)+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:mission.projectId})}); await showMission(mission.id); }; }
 for(const a of m.assets||[]){add('p',a.filename+' · '+a.mimeType+' · '+a.approvalState+' · '+a.sha256);if(['image/png','audio/wav'].includes(a.mimeType)&&!['FAILED','BLOCKED','CANCELLED'].includes(run.status)){const n=document.createElement(a.mimeType==='image/png'?'img':'audio');n.src='/api/media/assets/'+encodeURIComponent(a.assetId)+'/preview?projectId='+encodeURIComponent(mission.projectId);if(n.tagName==='IMG'){n.alt='Validated generated asset';n.style.maxWidth='320px';}else n.controls=true;panel.append(n);}}
 for(const a of data.artifacts){const link=add('a','Download approved manifest');link.className='button';link.href='/api/artifacts/'+encodeURIComponent(a.artifactId)+'/download?projectId='+encodeURIComponent(mission.projectId);}
}
setupMediaUI();
let presenceBusy=false;
const presenceTimer=setInterval(async()=>{if(presenceBusy||document.hidden||!selectedProjectId)return;presenceBusy=true;try{await refreshPresence();}catch{}finally{presenceBusy=false;}},5000);
window.addEventListener('pagehide',()=>clearInterval(presenceTimer),{once:true});
