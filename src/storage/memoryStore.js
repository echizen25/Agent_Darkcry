export class MemoryStore {
  constructor() { this.jobs = new Map(); this.artifacts = new Map(); this.approvals = new Map(); this.toolRuns = new Map(); }
  createJob(job) { if (this.jobs.has(job.jobId)) throw new Error('Duplicate job ID.'); this.jobs.set(job.jobId, job); return job; }
  getJob(id) { return this.jobs.get(id) || null; }
  listJobs() { return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  saveJob(job) { if (!this.jobs.has(job.jobId)) throw new Error('Unknown job.'); this.jobs.set(job.jobId, job); return job; }
  createArtifact(artifact) { if (this.artifacts.has(artifact.artifactId)) throw new Error('Duplicate artifact ID.'); this.artifacts.set(artifact.artifactId, artifact); return artifact; }
  listArtifacts(jobId) { return [...this.artifacts.values()].filter(item => item.jobId === jobId); }
  createApproval(approval) { this.approvals.set(approval.approvalId, approval); return approval; }
  getApproval(id) { return this.approvals.get(id) || null; }
  listApprovals(jobId = null) { return [...this.approvals.values()].filter(item => !jobId || item.jobId === jobId); }
  createToolRun(run) { this.toolRuns.set(run.toolRunId, run); return run; }
  listToolRuns(jobId = null) { return [...this.toolRuns.values()].filter(item => !jobId || item.jobId === jobId); }
}
