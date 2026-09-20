export class MemoryStore {
  constructor() { this.jobs = new Map(); this.artifacts = new Map(); }
  createJob(job) { if (this.jobs.has(job.jobId)) throw new Error('Duplicate job ID.'); this.jobs.set(job.jobId, job); return job; }
  getJob(id) { return this.jobs.get(id) || null; }
  listJobs() { return [...this.jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  saveJob(job) { if (!this.jobs.has(job.jobId)) throw new Error('Unknown job.'); this.jobs.set(job.jobId, job); return job; }
  createArtifact(artifact) { if (this.artifacts.has(artifact.artifactId)) throw new Error('Duplicate artifact ID.'); this.artifacts.set(artifact.artifactId, artifact); return artifact; }
  listArtifacts(jobId) { return [...this.artifacts.values()].filter(item => item.jobId === jobId); }
}
