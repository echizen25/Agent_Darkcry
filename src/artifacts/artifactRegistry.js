import { randomUUID } from 'node:crypto';

export class ArtifactRegistry {
  constructor(store) { this.store = store; }
  register({ job, task, agentId, output, validationStatus = 'VALID' }) {
    const artifact = {
      artifactId: randomUUID(), projectId: job.projectId, jobId: job.jobId, taskId: task.taskId,
      type: output.type, path: output.path || null, value: output.value ?? null,
      version: 1, creatorAgent: agentId, createdAt: new Date().toISOString(),
      validationStatus, sourceLineage: []
    };
    return this.store.createArtifact(artifact);
  }
  list(jobId) { return this.store.listArtifacts(jobId); }
}
