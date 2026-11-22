import path from 'node:path';
import { writeFile,readFile,lstat } from 'node:fs/promises';
import { hash,fail,mediaQA,packageContent,validatePart } from '../media/mediaCore.js';
import { inputDigest } from '../tools/approvalService.js';
import { MediaProviderGateway } from '../media/mediaProviders.js';
const definitions=[['plan','MEDIA_PLAN','planner'],['research','MEDIA_RESEARCH','research'],['creative','CREATIVE_DIRECTION','creative'],['script','SCRIPT','script'],['storyboard','STORYBOARD','storyboard'],['shots','SHOT_PLAN','shots'],['assetPlan','ASSET_PLAN','assetPlan'],['generation','ASSET_GENERATION','generation'],['review','MEDIA_REVIEW','reviewer'],['qa','MEDIA_QA','qa'],['approval','MEDIA_APPROVAL','approval'],['finalize','FINALIZE_ASSETS','finalize'],['final','FINAL_REVIEW','finalReviewer']];
const output=(data,summary='Media stage completed.')=>({status:'completed',summary,data});
export class MediaTaskGraph {
 constructor(core,{root,gateway=new MediaProviderGateway(),providerId=null}){this.core=core;this.root=root;this.gateway=gateway;this.providerId=providerId;this.controllers=new Map();this.assets=null;}
 definition(key,type,agent){return {key,type,dependsOn:[],title:type.replaceAll('_',' '),objective:type,assignedAgent:'media.'+agent,allowedTools:[],acceptanceCriteria:[{validatorId:'result.nonEmpty',params:{field:'summary'}}],maxAttempts:1,contextBudget:{maxInputTokens:7000,maxRetrievedSources:30}};}
 check(job){if(this.controllers.get(job.jobId)?.signal.aborted||job.mediaCancelled)throw fail('MEDIA_CANCELLED');if(Date.now()>job.metadata.media.deadline)throw fail('MEDIA_DEADLINE');}
 async stage(job,key,action=null,input={}){
  this.check(job);const task=job.tasks.find(t=>t.key===key),s=job.mediaState;
  if(!task||task.dependencies.some(id=>job.tasks.find(t=>t.taskId===id)?.status!=='COMPLETED'))throw fail('MEDIA_DEPENDENCY');
  job.currentTaskId=task.taskId;if(task.status==='QUEUED'){this.core.change(job,task,'PLANNING');this.core.change(job,task,'READY');this.core.change(job,task,'RUNNING');task.attempt++;}
  const context={...s,...input,request:job.metadata.media,projectId:job.projectId,jobId:job.jobId,taskId:task.taskId,readSources:i=>this.core.agents.get('presentation.research').execute(i)};
  const started=performance.now(),result=await(action?action(context):this.core.agents.get(task.assignedAgent).execute(context));this.check(job);
  if(result.status!=='completed')throw fail('MEDIA_STAGE_FAILED');
  task.result=result;this.core.change(job,task,'VALIDATING');
  const evaluated=this.core.evaluation.evaluate({result:{...result,data:{...result.data,summary:result.summary}},criteria:task.acceptanceCriteria});task.validations.push(evaluated);if(evaluated.status!=='pass')throw fail('MEDIA_EVALUATION_FAILED');
  for(const artifact of result.artifacts||[])this.core.artifacts.register({job,task,agentId:task.assignedAgent,output:artifact});
  Object.assign(s,result.data);s.performance[key]=performance.now()-started;this.core.change(job,task,'COMPLETED');this.core.store.saveJob(job);return result.data;
 }
 async extra(job,key,type,agent,action,input){
  const last=job.tasks.filter(t=>t.status==='COMPLETED').at(-1),[task]=this.core.makeTasks(job,[this.definition(key,type,agent)]);task.dependencies=last?[last.taskId]:[];job.tasks.splice(job.tasks.findIndex(t=>t.key==='approval'),0,task);return this.stage(job,key,action,input);
 }
 binding(job,kind){const s=job.mediaState,r=job.metadata.media;return {projectId:job.projectId,missionId:r.missionId,runId:r.runId,revision:s.revision,kind,fingerprint:kind==='generation'?hash({spec:s.specification,assetPlan:s.assetPlan,providerId:this.providerId,referenceHashes:this.references(job),regenerationTargets:s.pendingRepair?.targets||[]}):hash(packageContent(s))};}
 references(job){return job.mediaState.assetPlan.assets.flatMap(a=>a.referenceAssetIds.map(id=>this.assets.get(id,job.projectId).sha256));}
 pause(job,key,kind){
  const task=job.tasks.find(t=>t.key===key);if(task.status==='QUEUED'){this.core.change(job,task,'PLANNING');this.core.change(job,task,'READY');this.core.change(job,task,'RUNNING');task.attempt++;}
  const binding=this.binding(job,kind),approval=this.core.approvals.create({job,task,agent:{id:task.assignedAgent},tool:{id:'media.'+kind,riskLevel:'CONTROLLED'},action:kind==='generation'?'generate-exact-media-assets':'release-exact-media-package',input:binding,reason:'Approve exact media '+kind+' scope.'});approval.requestPreview={...binding,summary:job.mediaState.specification.title,qa:job.mediaState.qa?.status||'NOT_RUN',providerId:this.providerId};
  task.pendingApprovalId=approval.approvalId;this.core.change(job,task,'WAITING_FOR_APPROVAL');this.core.change(job,job,'WAITING_FOR_APPROVAL');return this.core.details(job.jobId);
 }
 async validateApproval(job,approval){
  const kind=approval.requestPreview?.kind;if(!['generation','final'].includes(kind)||approval.projectId!==job.projectId||approval.jobId!==job.jobId||approval.inputDigest!==inputDigest(this.binding(job,kind)))throw fail('STALE_MEDIA_APPROVAL');
  if(kind==='final'){
   if(mediaQA(job.mediaState,job.projectId).status!=='PASS'||job.mediaState.review.status!=='PASS'||job.mediaState.fingerprint!==this.binding(job,kind).fingerprint)throw fail('STALE_MEDIA_APPROVAL');
   for(const a of job.mediaState.assets) { const stored = this.assets.get(a.assetId, job.projectId); if (stored.runId !== job.metadata.media.runId || stored.sha256 !== a.sha256 || stored.generationFingerprint !== a.generationFingerprint || stored.approvalState !== 'GENERATION_ALLOWED') throw fail('STALE_MEDIA_APPROVAL'); await this.assets.download(a.assetId,job.projectId,{preview:true}); }
  }
 }
 async start(job){
  this.controllers.set(job.jobId,new AbortController());job.mediaState={schemaVersion:1,revision:1,revisions:[],assets:[],performance:{},meter:{calls:0}};job.metadata.media.deadline=Date.now()+90000;
  job.tasks=this.core.makeTasks(job,definitions.map(([k,t,a],i)=>({...this.definition(k,t,a),dependsOn:i?[definitions[i-1][0]]:[]})));
  this.core.change(job,job,'PLANNING');this.core.change(job,job,'READY');this.core.change(job,job,'RUNNING');
  for(const key of ['plan','research','creative','script','storyboard','shots','assetPlan'])await this.stage(job,key);
  // Resolve capability/configuration before asking for generation approval.
  const provider=this.gateway.registry.get(this.providerId);
  for(const a of job.mediaState.assetPlan.assets)if(!provider.capabilities.includes(a.capability)||a.origin!=='GENERATED')throw fail('MEDIA_UNSUPPORTED_CAPABILITY');
  if(!provider.configured)throw fail('MEDIA_NOT_CONFIGURED');
  if(provider.external)return this.pause(job,'generation','generation');
  return this.afterGeneration(job,false);
 }
 async generate(job,allowed,targets=null){
  const s=job.mediaState,p=this.gateway.registry.get(this.providerId),signal=this.controllers.get(job.jobId).signal;
  for(const a of s.assetPlan.assets.filter(a=>!targets||targets.includes(a.planId))){
   this.check(job);const refs=[]; for (const id of a.referenceAssetIds) refs.push(await this.assets.download(id,job.projectId)); const r={providerId:this.providerId,capability:a.capability,model:'default',parameters:{aspectRatio:s.specification.aspectRatio,resolution:s.specification.resolution,duration:s.specification.duration},prompt:a.prompt,referenceHashes:refs.map(a=>a.sha256)};
   const out=await this.gateway.request(r,{signal,generationApproval:allowed});this.check(job);
   const asset=await this.assets.register({projectId:job.projectId,missionId:job.metadata.media.missionId,runId:job.metadata.media.runId,planId:a.planId,origin:'GENERATED',providerId:out.providerId,model:out.model,bytes:out.bytes,mimeType:out.mimeType,generationFingerprint:out.generationFingerprint,sourceAssetIds:a.referenceAssetIds,evidenceRefs:a.evidenceRefs,signal});
   s.assets=s.assets.filter(v=>v.planId!==a.planId).concat(asset);
  }
  return output({assets:s.assets});
 }
 assembly(job){const s=job.mediaState;let start=0;return validatePart('assembly',{schemaVersion:1,tracks:s.storyboard.scenes.flatMap(scene=>{const at=start;start+=scene.duration;return scene.requiredAssets.map((p,i)=>({trackId:scene.sceneId+'-'+i,type:s.assets.find(a=>a.planId===p)?.type === 'AUDIO' ? 'VOICE' : 'IMAGE',sceneId:scene.sceneId,assetId:s.assets.find(a=>a.planId===p)?.assetId,start:at,duration:scene.duration}));})},s.specification);}
 async qa(job,key='qa'){return key==='qa'?this.stage(job,key,()=>output({qa:mediaQA(job.mediaState,job.projectId)})):this.extra(job,key,'MEDIA_QA','qa',()=>output({qa:mediaQA(job.mediaState,job.projectId)}));}
 async afterGeneration(job,allowed){
  await this.stage(job,'generation',()=>this.generate(job,allowed));job.mediaState.assembly=this.assembly(job);
  await this.stage(job,'review');await this.qa(job);
  this.snapshot(job); return this.reviewLoop(job);
 }
 async finishRepair(job,before) { const s=job.mediaState; s.assembly=this.assembly(job); s.revision++; if(hash(packageContent(s))===before)throw fail('MEDIA_NO_PROGRESS'); await this.extra(job,'review-'+s.revision,'MEDIA_REVIEW','reviewer');await this.qa(job,'qa-'+s.revision);this.snapshot(job); }
 async reviewLoop(job) {
  const s=job.mediaState;
  while((s.qa.status!=='PASS'||s.review.status!=='PASS')&&s.revision<3){
   const before=hash(packageContent(s));await this.extra(job,'critic-'+s.revision,'MEDIA_CRITIC','critic');
   const feedback=s.feedback,targets=feedback.affectedSegments.length?feedback.affectedSegments:s.script.segments.map(a=>a.segmentId),old=structuredClone(s.script);
   await this.extra(job,'revision-'+s.revision,'TARGETED_REVISION','script',null,{affectedIds:targets,feedback});
   s.script.segments=old.segments.map(a=>targets.includes(a.segmentId)?s.script.segments.find(v=>v.segmentId===a.segmentId)||a:a);
   if(feedback.affectedAssets.length){
    const key='regenerate-'+s.revision;
    if(this.gateway.registry.get(this.providerId).external){
     s.pendingRepair={key,before,targets:feedback.affectedAssets};
     const previous=job.tasks.filter(t=>t.status==='COMPLETED').at(-1),[task]=this.core.makeTasks(job,[this.definition(key,'TARGETED_REGENERATION','generation')]);task.dependencies=[previous.taskId];job.tasks.splice(job.tasks.findIndex(t=>t.key==='approval'),0,task);
     return this.pause(job,key,'generation');
    }
    await this.extra(job,key,'TARGETED_REGENERATION','generation',()=>this.generate(job,false,feedback.affectedAssets));
   }
   await this.finishRepair(job,before);
  }
  if(s.qa.status!=='PASS'||s.review.status!=='PASS')throw fail('MEDIA_REVISION_LIMIT');
  const approval=job.tasks.find(t=>t.key==='approval');approval.dependencies=[job.tasks.filter(t=>t.status==='COMPLETED').at(-1).taskId];return this.pause(job,'approval','final');
 }
 snapshot(job){const s=job.mediaState;s.fingerprint=hash(packageContent(s));s.revisions.push({revision:s.revision,fingerprint:s.fingerprint,qa:structuredClone(s.qa),review:structuredClone(s.review),content:packageContent(s)});}
 async continue(job,task){
  const approval=this.core.approvals.get(task.pendingApprovalId);await this.validateApproval(job,approval);approval.consumedAt=new Date().toISOString();task.pendingApprovalId=null;job.metadata.media.deadline=Date.now()+60000;
  if(approval.requestPreview.kind==='generation') { const pending=job.mediaState.pendingRepair; if (!pending) return this.afterGeneration(job,true); await this.stage(job,pending.key,()=>this.generate(job,true,pending.targets)); delete job.mediaState.pendingRepair; await this.finishRepair(job,pending.before); return this.reviewLoop(job); }
  await this.stage(job,'approval',()=>output({approval:{status:'APPROVED',fingerprint:job.mediaState.fingerprint}}));
  await this.stage(job,'finalize',()=>output({manifest:{...packageContent(job.mediaState),revision:job.mediaState.revision,fingerprint:job.mediaState.fingerprint,qa:job.mediaState.qa,approval:job.mediaState.approval,artifactRefs:this.core.artifacts.list(job.jobId).map(a=>a.artifactId),output:'MEDIA_PACKAGE_ONLY',composition:'NOT_IMPLEMENTED'}}));
  await this.stage(job,'final',null,{approval});
  if(!job.mediaState.finalReview.passed)throw fail('MEDIA_FINAL_REVIEW_FAILED');
  const s=job.mediaState,r=job.metadata.media,dir=await this.assets.directory(job.projectId,r.missionId,r.runId),filename='manifest.json',file=path.join(dir,filename),bytes=Buffer.from(JSON.stringify(s.manifest,null,2));
  await writeFile(file,bytes,{flag:'wx'});this.check(job);
  for(const a of s.assets){a.approvalState='APPROVED';a.approvedAt=new Date().toISOString();}await this.assets.store.save();
  this.core.artifacts.register({job,task,agentId:'media.finalize',output:{type:'MEDIA_FILE',path:file,value:{filename,mimeType:'application/json',bytes:bytes.length,sha256:hash(bytes),fingerprint:s.fingerprint,revision:s.revision}}});
  job.finalReview=output({passed:true},'Approved media package finalized; no MP4 composition.');this.core.change(job,job,'VALIDATING');this.core.change(job,job,'COMPLETED');this.controllers.delete(job.jobId);return this.core.details(job.jobId);
 }
 cancel(job){job.mediaCancelled=true;this.controllers.get(job.jobId)?.abort();for(const a of this.assets.store.state.mediaAssets.filter(a=>a.runId===job.metadata.media.runId))a.approvalState='CANCELLED';for(const a of this.core.store.listApprovals(job.jobId).filter(a=>a.status==='PENDING'))this.core.approvals.resolve(a.approvalId,'DENIED');for(const t of job.tasks)if(!['FAILED','COMPLETED','CANCELLED'].includes(t.status))this.core.change(job,t,'CANCELLED');if(!['FAILED','COMPLETED','CANCELLED'].includes(job.status))this.core.change(job,job,'CANCELLED');return this.core.details(job.jobId);}
 async manifestDownload(item){const dir=await this.assets.directory(item.projectId,item.missionId,item.runId),file=path.join(dir,'manifest.json');if(item.path!==file||(await lstat(file)).isSymbolicLink()||hash(await readFile(file))!==item.sha256)throw fail('MEDIA_MANIFEST_CHANGED');return item;}
}
