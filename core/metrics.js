const metrics = {
  aiCalls: 0,
  aiForced: 0,
  aiOptional: 0,
  aiSkipped: 0,
  aiFallbacks: 0,
  aiValidationFailed: 0,
  byScenario: {},
  byFindingCode: {}
};

function trackDecision(decision, scenarioId, findings = []) {
  if (!decision.useAI) {
    metrics.aiSkipped++;
    return;
  }

  metrics.aiCalls++;

  if (decision.mode === 'force') metrics.aiForced++;
  if (decision.mode === 'optional') metrics.aiOptional++;

  metrics.byScenario[scenarioId] =
    (metrics.byScenario[scenarioId] || 0) + 1;

  findings.forEach((f) => {
    if (!f || !f.code) return;
    metrics.byFindingCode[f.code] =
      (metrics.byFindingCode[f.code] || 0) + 1;
  });
}

function trackValidationFail() {
  metrics.aiValidationFailed++;
}

function trackFallback() {
  metrics.aiFallbacks++;
}

module.exports = {
  metrics,
  trackDecision,
  trackValidationFail,
  trackFallback
};
