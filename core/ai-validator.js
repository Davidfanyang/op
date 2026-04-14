const { runValidationKit } = require('./validation-kit-bridge');

async function validateAiOutput(aiResult, scenario, ruleResult) {
  if (!aiResult || typeof aiResult !== 'object') {
    return { valid: false, reason: 'empty_or_invalid_object' };
  }

  if (!aiResult.rewrittenReply || typeof aiResult.rewrittenReply !== 'string') {
    return { valid: false, reason: 'missing_rewritten_reply' };
  }

  if (!Array.isArray(aiResult.suggestions)) {
    return { valid: false, reason: 'invalid_suggestions' };
  }

  if (!Array.isArray(aiResult.riskNotes)) {
    return { valid: false, reason: 'invalid_risk_notes' };
  }

  if (
    typeof aiResult.confidence !== 'number' ||
    aiResult.confidence < 0 ||
    aiResult.confidence > 100
  ) {
    return { valid: false, reason: 'invalid_confidence' };
  }

  if (
    aiResult.rewrittenReply.length < 10 ||
    aiResult.rewrittenReply.length > 500
  ) {
    return { valid: false, reason: 'rewritten_reply_length_invalid' };
  }

  const banned = ['保证成功', '一定到账', '我们负责全部'];
  const hasBanned = banned.some((word) =>
    aiResult.rewrittenReply.includes(word)
  );
  if (hasBanned) {
    return { valid: false, reason: 'contains_banned_phrase' };
  }

  const shouldAvoid = scenario?.qualityChecks?.shouldAvoid || [];
  const hasAvoid = shouldAvoid.some((word) =>
    aiResult.rewrittenReply.includes(word)
  );
  if (hasAvoid) {
    return { valid: false, reason: 'contains_should_avoid' };
  }

  const kitResult = await runValidationKit({ aiResult, scenario, ruleResult });
  const phaseOutcomes = kitResult.validation.phaseOutcomes || [];
  const hardFail = kitResult.validation.status === 'hard_fail';

  if (hardFail) {
    return {
      valid: false,
      reason: 'validation_kit_hard_fail',
      validationKit: kitResult
    };
  }

  return {
    valid: true,
    reason: 'ok',
    validationKit: {
      validation: kitResult.validation,
      evaluation: kitResult.evaluation,
      phaseOutcomes
    }
  };
}

module.exports = { validateAiOutput };
