function buildFeedback(result, scenario) {
  const coachSummary = result.score >= 85
    ? '这条回复已经接近可用客服回复。'
    : result.score >= 60
      ? '这条回复基本方向对，但还不够稳。'
      : '这条回复暂时还不适合直接发给用户。';

  return {
    score: result.score,
    coachSummary,
    dimensionScores: result.dimensionScores,
    strengths: result.strengths,
    findings: result.findings,
    suggestions: result.suggestions,
    standardReply: scenario.standardReply,
    scenario: {
      id: scenario.id,
      title: scenario.title,
      product: scenario.product,
      category: scenario.category
    },
    meta: {
      evaluatorVersion: 'v1.1',
      mode: 'structured-rule'
    }
  };
}

module.exports = { buildFeedback };
