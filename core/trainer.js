const { getScenarioById } = require('./scenario-loader');
const { evaluateReply } = require('./evaluator');
const { buildFeedback } = require('./feedback');

function evaluateTraining(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('input 必须是对象');
  }

  const { scenarioId, userReply } = input;

  if (!scenarioId) {
    throw new Error('缺少 scenarioId');
  }

  if (!userReply || typeof userReply !== 'string') {
    throw new Error('缺少 userReply');
  }

  const scenario = getScenarioById(scenarioId);
  if (!scenario) {
    throw new Error(`未找到场景: ${scenarioId}`);
  }

  const result = evaluateReply(userReply, scenario);
  return buildFeedback(result, scenario);
}

module.exports = { evaluateTraining };
