export class EvaluatorRegistry {
  constructor() { this.evaluators = new Map(); }
  register(evaluator) {
    if (!evaluator?.id || typeof evaluator.evaluate !== 'function') throw new Error('Evaluator requires an ID and evaluate method.');
    if (this.evaluators.has(evaluator.id)) throw new Error(`Evaluator already registered: ${evaluator.id}`);
    this.evaluators.set(evaluator.id, evaluator); return evaluator;
  }
  get(id) { const evaluator = this.evaluators.get(id); if (!evaluator) throw new Error(`Unknown evaluator: ${id}`); return evaluator; }
  list() { return [...this.evaluators.values()].map(({ id, name }) => ({ id, name })); }
}
