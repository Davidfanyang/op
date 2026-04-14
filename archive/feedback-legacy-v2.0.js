function buildFeedback(result, scenario) {
  // 更细致的评分总结
  let coachSummary;
  if (result.score >= 90) {
    coachSummary = '优秀！这条回复质量很高，可以直接使用。';
  } else if (result.score >= 80) {
    coachSummary = '良好！这条回复接近标准，稍作优化即可。';
  } else if (result.score >= 60) {
    coachSummary = '这条回复基本方向对，但还需要改进。';
  } else if (result.score >= 40) {
    coachSummary = '这条回复有明显不足，建议参考标准话术重写。';
  } else {
    coachSummary = '这条回复暂时还不适合直接发给用户，请认真学习标准回复。';
  }

  // 构建维度详情
  const dimensionDetails = {
    attitude: {
      name: '态度礼貌性',
      score: result.dimensionScores.attitude,
      maxScore: 20,
      feedback: result.dimensionScores.attitude >= 16 
        ? '礼貌用语使用得当' 
        : result.dimensionScores.attitude >= 12 
          ? '礼貌表达尚可，可更亲切'
          : '需要加强礼貌用语'
    },
    process: {
      name: '流程完整性',
      score: result.dimensionScores.process,
      maxScore: 20,
      feedback: result.dimensionScores.process >= 16 
        ? '处理流程清晰完整' 
        : result.dimensionScores.process >= 12 
          ? '流程基本完整，可更详细'
          : '需要明确处理步骤'
    },
    information: {
      name: '信息收集',
      score: result.dimensionScores.information,
      maxScore: 20,
      feedback: result.dimensionScores.information >= 16 
        ? '信息收集完整' 
        : result.dimensionScores.information >= 12 
          ? '信息收集尚可'
          : '需要明确收集必要信息'
    },
    empathy: {
      name: '安抚能力',
      score: result.dimensionScores.empathy,
      maxScore: 20,
      feedback: result.dimensionScores.empathy >= 16 
        ? '安抚表达到位' 
        : result.dimensionScores.empathy >= 12 
          ? '安抚能力尚可'
          : '需要加强安抚语气'
    },
    clarity: {
      name: '表达清晰度',
      score: result.dimensionScores.clarity,
      maxScore: 20,
      feedback: result.dimensionScores.clarity >= 16 
        ? '表达清晰简洁' 
        : result.dimensionScores.clarity >= 12 
          ? '表达基本清晰'
          : '需要优化表达结构'
    }
  };

  return {
    score: result.score,
    maxScore: 100,
    coachSummary,
    dimensionScores: result.dimensionScores,
    dimensionDetails,
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
      evaluatorVersion: 'v2.0',
      mode: 'semantic-intelligent',
      evaluationDetails: result.details || null
    }
  };
}

module.exports = { buildFeedback };
