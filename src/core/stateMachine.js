export const STATES = Object.freeze(['QUEUED', 'PLANNING', 'READY', 'RUNNING', 'VALIDATING', 'REVISING', 'WAITING_FOR_APPROVAL', 'BLOCKED', 'COMPLETED', 'FAILED', 'CANCELLED']);

const next = {
  QUEUED: ['PLANNING', 'CANCELLED'],
  PLANNING: ['READY', 'WAITING_FOR_APPROVAL', 'BLOCKED', 'FAILED', 'CANCELLED'],
  READY: ['RUNNING', 'WAITING_FOR_APPROVAL', 'CANCELLED'],
  RUNNING: ['VALIDATING', 'WAITING_FOR_APPROVAL', 'BLOCKED', 'FAILED', 'CANCELLED'],
  VALIDATING: ['COMPLETED', 'REVISING', 'WAITING_FOR_APPROVAL', 'BLOCKED', 'FAILED', 'CANCELLED'],
  REVISING: ['RUNNING', 'WAITING_FOR_APPROVAL', 'BLOCKED', 'FAILED', 'CANCELLED'],
  WAITING_FOR_APPROVAL: ['BLOCKED', 'CANCELLED'],
  BLOCKED: ['READY', 'CANCELLED'],
  COMPLETED: [], FAILED: [], CANCELLED: []
};

export class StateError extends Error {
  constructor(from, to) { super(`Invalid state transition: ${from} -> ${to}`); this.name = 'StateError'; this.status = 409; }
}

export function transition(entity, to, approvedReturnState = null) {
  const allowed = next[entity.status] || [];
  if (!allowed.includes(to) && !(entity.status === 'WAITING_FOR_APPROVAL' && approvedReturnState === to && entity.approvalReturnState === to)) throw new StateError(entity.status, to);
  if (to === 'WAITING_FOR_APPROVAL') entity.approvalReturnState = entity.status;
  if (entity.status === 'WAITING_FOR_APPROVAL' && to !== 'WAITING_FOR_APPROVAL') entity.approvalReturnState = null;
  entity.status = to;
  if (to === 'RUNNING' && !entity.startedAt) entity.startedAt = new Date().toISOString();
  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(to)) entity.completedAt = new Date().toISOString();
  return entity;
}
