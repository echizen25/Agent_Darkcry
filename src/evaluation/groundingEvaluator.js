const words = text => (String(text || '').toLowerCase().match(/[\p{L}\p{N}_]+/gu) || []).filter(word => !['a', 'an', 'and', 'are', 'by', 'for', 'in', 'is', 'of', 'on', 'the', 'to', 'uses', 'use', 'with'].includes(word));
const compact = text => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
const issue = (type, index, description, suggestedAction, evidence = []) => ({ type, severity: 'HIGH', category: 'GROUNDING', location: `claim:${index}`, description, suggestedAction, evidence });
const questionTerms = (question, projectId) => words(String(question || '').replace(/\bproject\s+[\p{L}\p{N}_]+\b/giu, '')).filter(word => !['how', 'what', 'which', 'where', 'when', 'why', 'does', 'do', 'work', 'question', 'about'].includes(word) && !words(projectId).includes(word));

export const groundingEvaluator = {
  id: 'research.grounding', name: 'Deterministic claim grounding',
  evaluate({ result }) {
    const claims = result.data?.claims;
    const context = result.data?.retrievedContext;
    const issues = [];
    const abstention = Array.isArray(claims) && !claims.length && typeof result.data?.answer === 'string' && /not provide enough evidence|insufficient evidence/i.test(result.data.answer) && Array.isArray(result.data?.limitations) && result.data.limitations.some(item => /no supporting project evidence|insufficient evidence/i.test(item)) && !result.data?.modelError;
    const terms = questionTerms(result.data?.question, result.data?.projectId);
    const relevant = (context?.items || []).length > 0 && (!terms.length || context.items.some(item => words(item.text).some(word => terms.includes(word))));
    if (!Array.isArray(claims) || !claims.length && (!abstention || relevant)) issues.push(issue('no_grounded_claims', 0, 'No grounded claims were produced.', 'Retrieve relevant sources and produce cited claims.'));
    if ((!Array.isArray(context?.items) || !context.items.length) && !abstention) issues.push(issue('no_retrieved_evidence', 0, 'No source context was retrieved.', 'Use available project sources or report that evidence is unavailable.'));
    if (Array.isArray(claims)) claims.forEach((claim, index) => {
      if (typeof claim?.text !== 'string' || !claim.text.trim() || !Array.isArray(claim.evidence) || !claim.evidence.length) {
        issues.push(issue('claim_missing_evidence', index, 'Claim has no usable text or citation.', 'Cite an exact source excerpt for each claim.')); return;
      }
      const quotes = [];
      for (const citation of claim.evidence) {
        const item = context.items.find(entry => entry.chunkId === citation?.chunkId);
        if (!item || typeof citation?.quote !== 'string' || !citation.quote.trim() || !compact(item.text).includes(compact(citation.quote))) {
          issues.push(issue('invalid_citation', index, 'Citation does not match a retrieved source excerpt.', 'Use a chunk ID and exact quote from retrieved context.', [{ type: 'sourceChunk', chunkId: citation?.chunkId || null }]));
        } else quotes.push(citation.quote);
      }
      const claimWords = words(claim.text);
      const quoteWords = new Set(words(quotes.join(' ')));
      if (!claimWords.length || claimWords.some(word => !quoteWords.has(word))) issues.push(issue('unsupported_claim', index, 'Claim contains terms absent from its cited evidence.', 'Remove unsupported terms or retrieve a source that supports the claim.', claim.evidence.map(item => ({ type: 'sourceChunk', chunkId: item.chunkId }))));
    });
    return { status: issues.length ? 'fail' : 'pass', issues, evidence: Array.isArray(claims) ? claims.flatMap(claim => claim.evidence || []).map(item => ({ type: 'sourceChunk', chunkId: item.chunkId })) : [] };
  }
};
