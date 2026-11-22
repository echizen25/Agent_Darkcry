// Read-only current-session projection. No scheduler, permissions or mutation API.
const departments = { demo: 'OPERATIONS', research: 'RESEARCH', development: 'DEVELOPMENT', document: 'DOCUMENTS', presentation: 'PRESENTATIONS', media: 'MEDIA' };
const active = new Set(['QUEUED','PLANNING','READY','RUNNING','VALIDATING','REVISING','WAITING_FOR_APPROVAL','BLOCKED']);
const priority = { WAITING_APPROVAL:0, BLOCKED:1, REVIEWING:2, WORKING:3, PLANNING:4, ASSIGNED:5, FAILED:6, CANCELLED:7, COMPLETED:8 };
const labels = { IDLE:'No active task',ASSIGNED:'Task assigned',PLANNING:'Planning task',WORKING:'Executing task',REVIEWING:'Reviewing task',WAITING_APPROVAL:'Waiting for approval',BLOCKED:'Task blocked',COMPLETED:'Task completed',FAILED:'Task failed',CANCELLED:'Task cancelled' };
export function presenceStatus(task,job) {
 if(job.status==='CANCELLED')return 'CANCELLED';
 if(task.status==='WAITING_FOR_APPROVAL')return 'WAITING_APPROVAL';
 if(task.status==='BLOCKED')return 'BLOCKED';
 if(task.status==='FAILED')return 'FAILED';
 if(task.status==='CANCELLED')return 'CANCELLED';
 if(task.status==='COMPLETED')return 'COMPLETED';
 if(task.status==='QUEUED'||task.status==='READY')return 'ASSIGNED';
 if(task.status==='PLANNING')return 'PLANNING';
 if(task.status==='VALIDATING'||/REVIEW|QA|CHECK/.test(task.type||''))return 'REVIEWING';
 return 'WORKING';
}
export class AgentPresenceService {
 constructor({core,projects,missions}){this.core=core;this.projects=projects;this.missions=missions;this.startedAt=new Date().toISOString();this.mapping=new Map();
  // Snapshot explicit registered identities; unknown/unregistered task IDs never create characters.
  for(const agent of core.agents.list()){const departmentId=departments[agent.id.split('.')[0]];if(departmentId&&/^[a-zA-Z0-9._-]{1,100}$/.test(agent.id))this.mapping.set(agent.id,{agentId:agent.id,displayName:String(agent.role||agent.id).replace(/[^a-zA-Z0-9 ._-]/g,'').slice(0,80),departmentId,roleId:agent.id});}
 }
 view(projectId,missionId=null){
  this.projects.get(projectId);if(missionId)this.missions.getForProject(projectId,missionId);
  const runs=this.missions.store.state.runs.filter(r=>r.projectId===projectId&&(!missionId||r.missionId===missionId));
  const byJob=new Map(runs.map(r=>[r.jobId,r])),jobs=this.core.store.listJobs().filter(j=>j.projectId===projectId&&byJob.has(j.jobId));
  let unknownAgentCount=0;
  const records=[...this.mapping.values()].slice(0,100).map(meta=>{
   const candidates=[];
   for(const job of jobs)for(const task of job.tasks.filter(t=>t.assignedAgent===meta.agentId)){
    const run=byJob.get(job.jobId),event=job.events.filter(e=>e.taskId===task.taskId).at(-1);
    candidates.push({schemaVersion:1,...meta,missionId:run.missionId,runId:run.id,taskId:task.taskId,status:presenceStatus(task,job),lastEventAt:event?.timestamp||task.completedAt||task.startedAt||job.createdAt,activityLabel:'',active:active.has(task.status)&&!['COMPLETED','FAILED','CANCELLED','BLOCKED'].includes(job.status)});
   }
   const current=candidates.filter(c=>c.active),pool=current.length?current:candidates;
   pool.sort((a,b)=>current.length?(priority[a.status]-priority[b.status]||b.lastEventAt.localeCompare(a.lastEventAt)||a.taskId.localeCompare(b.taskId)):(b.lastEventAt.localeCompare(a.lastEventAt)||a.taskId.localeCompare(b.taskId)));
   // A completed prior task is historical, not an invented active assignment.
   const last=pool[0],show=last&&(['FAILED','CANCELLED','COMPLETED','BLOCKED'].includes(last.status)||current.length);
   const record=show?{...last}:{schemaVersion:1,...meta,missionId:null,runId:null,taskId:null,status:'IDLE',lastEventAt:this.startedAt};
   delete record.active;record.activityLabel=labels[record.status];return record;
  });
  for(const job of jobs)unknownAgentCount+=job.tasks.filter(t=>!this.mapping.has(t.assignedAgent)).length;
  return {schemaVersion:1,scope:'CURRENT_SESSION',projectId,missionId:missionId||null,departments:Object.values(departments),reservedDepartments:[{id:'EMAIL',status:'NOT_IMPLEMENTED'},{id:'SOCIAL',status:'NOT_IMPLEMENTED'},{id:'TRADING',status:'NOT_IMPLEMENTED'},{id:'BUSINESS',status:'NOT_IMPLEMENTED'}],aggregation:'Active tasks first; approval, blocked, review, work, planning, assigned. Otherwise latest terminal event; task ID breaks ties.',unknownAgentCount,records};
 }
}
