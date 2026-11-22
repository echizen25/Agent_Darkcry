import { createHash } from 'node:crypto';
import { validateDocumentIR } from '../documents/documentCore.js';
export const TYPES = ['IMAGE','VIDEO','AUDIO','MEDIA_PACKAGE'];
export const CAPABILITIES = ['IMAGE_GENERATION','VIDEO_GENERATION','VOICE_GENERATION','AUDIO_GENERATION'];
export const fail = code => Object.assign(new Error(code), { code, status: 400 });
export const canonical = value => JSON.stringify(value, (_k,v) => v && typeof v === 'object' && !Array.isArray(v) && !Buffer.isBuffer(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);
export const hash = value => createHash('sha256').update(Buffer.isBuffer(value) ? value : canonical(value)).digest('hex');
export const validId = v => typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v);
export const text = (v,max=500) => { if(typeof v !== 'string'||v.length>max||/[\0\x01-\x08]/.test(v)) throw fail('MEDIA_TEXT_INVALID'); return v.trim(); };
const choice=(v,a)=>{if(!a.includes(v))throw fail('MEDIA_ENUM_INVALID');return v;};
const bound=(v,min,max)=>{if(!Number.isFinite(v)||v<min||v>max)throw fail('MEDIA_BOUND_INVALID');return v;};
const list=(v,max=12,min=1)=>{if(!Array.isArray(v)||v.length<min||v.length>max)throw fail('MEDIA_LIST_INVALID');return v;};
export function mediaSpecification(i={}) {
 return {schemaVersion:1,type:choice(i.type??'MEDIA_PACKAGE',TYPES),title:text(i.title??'Project media',180),purpose:text(i.purpose??'Explain project evidence'),audience:text(i.audience??'Project stakeholders',120),platform:choice(i.platform??'INTERNAL',['INTERNAL','WEB','PRESENTATION','SOCIAL_DRAFT']),language:choice(i.language??'English',['English','Filipino','Taglish']),style:choice(i.style??'PROFESSIONAL',['PROFESSIONAL','MINIMAL','EDUCATIONAL']),duration:bound(i.duration??10,1,180),aspectRatio:choice(i.aspectRatio??'16:9',['16:9','9:16','1:1']),resolution:choice(i.resolution??'PREVIEW',['PREVIEW','HD']),constraints:{maxScenes:12,maxAssets:12,maxRevisions:2,sourcePolicy:'PROJECT_ONLY'}};
}
const fields={creative:['message','visualStyle','pacing','opening','ending','evidenceRefs'],segments:['segmentId','voiceOver','onScreenText','duration','evidenceRefs'],scenes:['sceneId','segmentId','description','duration','transition','requiredAssets'],shots:['shotId','sceneId','shotType','motionIntent','duration'],assets:['planId','type','origin','capability','prompt','evidenceRefs','referenceAssetIds'],tracks:['trackId','type','sceneId','assetId','start','duration']};
export function validatePart(kind,v,s) {
 if(!v||v.schemaVersion!==1||canonical(v).length>60000)throw fail('MEDIA_IR_INVALID');
 const refs=a=>list(a,12,0).forEach(r=>{if(!validId(r))throw fail('MEDIA_REF_INVALID');});
 const key={script:'segments',storyboard:'scenes',shots:'shots',assetPlan:'assets',assembly:'tracks'}[kind];
 if(kind==='creative'){for(const k of fields.creative.filter(k=>k!=='evidenceRefs'))text(v[k]);refs(v.evidenceRefs);return {schemaVersion:1,...Object.fromEntries(fields.creative.map(k=>[k,v[k]]))};}
 if(!key)throw fail('MEDIA_IR_KIND');
 const items=list(v[key],key==='tracks'?48:12), ids=new Set();
 for(const a of items) {
  const idKey={segments:'segmentId',scenes:'sceneId',shots:'shotId',assets:'planId',tracks:'trackId'}[key];
  if(!validId(a[idKey])||ids.has(a[idKey]))throw fail('MEDIA_ID_INVALID');ids.add(a[idKey]);
  if(key==='segments'){text(a.voiceOver,1200);text(a.onScreenText,400);bound(a.duration,.1,s.duration);refs(a.evidenceRefs);}
  if(key==='scenes'){if(!validId(a.segmentId))throw fail('MEDIA_REF_INVALID');text(a.description);bound(a.duration,.1,s.duration);choice(a.transition,['CUT','FADE','NONE']);refs(a.requiredAssets);}
  if(key==='shots'){if(!validId(a.sceneId))throw fail('MEDIA_REF_INVALID');choice(a.shotType,['STILL','WIDE','DETAIL']);text(a.motionIntent,200);bound(a.duration,.1,s.duration);}
  if(key==='assets'){choice(a.type,['IMAGE','VIDEO','AUDIO']);choice(a.origin,['GENERATED','USER_PROVIDED','PROJECT_SOURCE','DERIVED']);choice(a.capability,CAPABILITIES);if((a.type==='IMAGE')!==(a.capability==='IMAGE_GENERATION')||(a.type==='VIDEO')!==(a.capability==='VIDEO_GENERATION'))throw fail('MEDIA_CAPABILITY_TYPE');text(a.prompt,2000);refs(a.evidenceRefs);refs(a.referenceAssetIds);}
  if(key==='tracks'){choice(a.type,['IMAGE','VIDEO','VOICE','MUSIC','TEXT']);bound(a.start,0,s.duration);bound(a.duration,.1,s.duration);if(a.start+a.duration>s.duration+.01||!validId(a.sceneId)||(a.type!=='TEXT'&&!validId(a.assetId)))throw fail('MEDIA_TIMELINE_BOUNDS');}
 }
 return {schemaVersion:1,[key]:items.map(a=>Object.fromEntries(fields[key].filter(k=>a[k]!==undefined).map(k=>[k,a[k]])))};
}
export function mediaQA(state,projectId) {
 const issues=[], add=(type,location='package')=>issues.push({type,location}),s=state.specification,p=state.evidencePack;
 try { if (canonical(mediaSpecification(s)) !== canonical(s)) add('INVALID_SPECIFICATION'); } catch { add('INVALID_SPECIFICATION'); }
 for(const k of ['creative','script','storyboard','shots','assetPlan','assembly'])try{validatePart(k,state[k],s);}catch{add('INVALID_'+k.toUpperCase(),k);}
 if(!p||p.projectId!==projectId||p.items.some(e=>e.projectId!==projectId))add('CROSS_PROJECT_EVIDENCE');
 if(issues.length)return {status:'FAIL',issues};
 const blocks=[{text:state.creative.message,evidenceRefs:state.creative.evidenceRefs},...state.script.segments.flatMap(a=>[{text:a.voiceOver,evidenceRefs:a.evidenceRefs},{text:a.onScreenText,evidenceRefs:a.evidenceRefs}])];
 for(const [i,b]of blocks.entries()){
  if(b.text&&!b.evidenceRefs.length)add('MISSING_EVIDENCE','segment:'+i);
  const q=validateDocumentIR({metadata:{title:'Media'},sections:[{heading:'Media',blocks:[{type:'paragraph',...b}]}]},{sections:['Media'],constraints:{allowPlaceholders:false}},p);issues.push(...q.issues.map(a=>({...a,location:'segment:'+i})));
  const evidence=b.evidenceRefs.map(r=>p.items.find(e=>e.id===r)?.text||'').join(' ');
  for(const n of b.text.match(/\b\d+(?:\.\d+)?\b/g)||[])if(!(evidence.match(/\b\d+(?:\.\d+)?\b/g)||[]).includes(n))add('UNSUPPORTED_NUMERIC_CLAIM','segment:'+i);
  const supported=new Set(evidence.toLowerCase().match(/[a-z]{4,}/g)||[]);if((b.text.toLowerCase().match(/[a-z]{4,}/g)||[]).some(w=>!supported.has(w)))add('UNSUPPORTED_CLAIM','segment:'+i);
 }
 const segments=state.script.segments,scenes=state.storyboard.scenes,assets=state.assets||[];
 if(Math.abs(segments.reduce((n,a)=>n+a.duration,0)-s.duration)>.01||Math.abs(scenes.reduce((n,a)=>n+a.duration,0)-s.duration)>.01)add('DURATION_MISMATCH');
 for (const shot of state.shots.shots) if (!scenes.some(scene => scene.sceneId === shot.sceneId)) add('UNKNOWN_SHOT_SCENE',shot.shotId);
 for(const scene of scenes){const seg=segments.find(a=>a.segmentId===scene.segmentId);if(!seg||seg.duration!==scene.duration)add('SCENE_MISMATCH',scene.sceneId);if(Math.abs(state.shots.shots.filter(a=>a.sceneId===scene.sceneId).reduce((n,a)=>n+a.duration,0)-scene.duration)>.01)add('SHOT_DURATION',scene.sceneId);for(const a of scene.requiredAssets)if(!state.assetPlan.assets.some(v=>v.planId===a))add('MISSING_ASSET_PLAN',scene.sceneId);}
 for(const a of state.assetPlan.assets){const asset=assets.find(v=>v.planId===a.planId);if(!asset||asset.projectId!==projectId)add('MISSING_ASSET',a.planId);else{if(asset.approvalState!=='GENERATION_ALLOWED')add('UNAPPROVED_ASSET',a.planId);if(asset.type!==a.type)add('ASSET_TYPE',a.planId);if(s.type==='AUDIO'&&asset.type!=='AUDIO'||s.type==='IMAGE'&&asset.type!=='IMAGE')add('MISSION_ASSET_TYPE',a.planId);if(asset.duration&&asset.duration>s.duration+.01)add('ASSET_DURATION',a.planId);const [w,h]=s.aspectRatio.split(':').map(Number);if(asset.width&&Math.abs(asset.width/asset.height-w/h)>.02)add('ASPECT_RATIO',a.planId);}for(const r of a.evidenceRefs)if(!p.items.some(e=>e.id===r&&e.projectId===projectId))add('UNKNOWN_EVIDENCE',a.planId);}
 for(const t of state.assembly.tracks)if(!scenes.some(a=>a.sceneId===t.sceneId)||(t.type!=='TEXT'&&!assets.some(a=>a.assetId===t.assetId&&a.projectId===projectId)))add('ASSEMBLY_REFERENCE');
 return {status:issues.length?'FAIL':'PASS',issues};
}
export const packageContent=s=>({schemaVersion:1,specification:s.specification,creative:s.creative,script:s.script,storyboard:s.storyboard,shots:s.shots,assetPlan:s.assetPlan,assembly:s.assembly,assets:(s.assets||[]).map(({assetId,sha256,generationFingerprint,planId})=>({assetId,sha256,generationFingerprint,planId}))});
