const { shouldUseAiCoach } = require('./ai-decision');
const { validateAiOutput } = require('./ai-validator');
const { callAiCoach } = require('./ai-coach');
const {
  trackDecision,
  trackValidationFail,
  trackFallback,
  metrics
} = require('./metrics');

async function runAiEnhancedTrainerCore(ruleResult, scenario) {
  const { score, findings, scenarioId } = ruleResult;

  const decision = shouldUseAiCoach(score, findings);
  trackDecision(decision, scenarioId, findings);

  if (!decision.useAI) {
    return {
      ...ruleResult,
      aiDecision: decision,
      metricsSnapshot: { ...metrics }
    };
  }

  const aiResult = await callAiCoach({ ruleResult, scenario });
  const validation = await validateAiOutput(aiResult, scenario, ruleResult);

  if (!validation.valid) {
    trackValidationFail();
    trackFallback();

    return {
      ...ruleResult,
      aiDecision: decision,
      aiFallback: true,
      aiError: validation.reason,
      metricsSnapshot: { ...metrics }
    };
  }

  return {
    ...ruleResult,
    aiDecision: decision,
    aiEnhanced: true,
    aiResult,
    aiValidation: validation,
    metricsSnapshot: { ...metrics }
  };
}

module.exports = { runAiEnhancedTrainerCore };
