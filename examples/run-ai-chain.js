const fs = require('fs');
const path = require('path');
const { getScenarioById } = require('../core/scenario-loader');
const { runAiEnhancedTrainerCore } = require('../core');

async function main() {
  const rulePath = path.resolve(__dirname, 'rule-result-bad.json');
  const ruleResult = JSON.parse(fs.readFileSync(rulePath, 'utf8'));
  ruleResult.originalReply = '你自己联系银行，这个我们不管，等等看吧。';
  const scenario = getScenarioById(ruleResult.scenarioId);
  const result = await runAiEnhancedTrainerCore(ruleResult, scenario);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
