const HIGH_RISK_CODES = [
  'risk_phrase',
  'dangerous_promise',
  'wrong_process',
  'cold_response'
];

function shouldUseAiCoach(score, findings = []) {
  const hasHighRisk = findings.some((item) =>
    HIGH_RISK_CODES.includes(item.code)
  );

  if (hasHighRisk) {
    return {
      useAI: true,
      mode: 'force',
      reason: 'high_risk_finding'
    };
  }

  if (score < 70) {
    return {
      useAI: true,
      mode: 'force',
      reason: 'low_score'
    };
  }

  if (score < 85) {
    return {
      useAI: true,
      mode: 'optional',
      reason: 'mid_score'
    };
  }

  return {
    useAI: false,
    mode: 'skip',
    reason: 'high_score'
  };
}

module.exports = { shouldUseAiCoach, HIGH_RISK_CODES };
