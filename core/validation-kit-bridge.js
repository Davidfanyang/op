const path = require('path');
const { pathToFileURL } = require('url');

let cachedKit = null;

async function getValidationKit() {
  if (cachedKit) return cachedKit;
  const entry = path.resolve(__dirname, '..', '..', 'validation-kit', 'dist', 'index.js');
  const mod = await import(pathToFileURL(entry).href);
  cachedKit = mod;
  return mod;
}

async function runValidationKit({ aiResult, scenario, ruleResult }) {
  const kit = await getValidationKit();

  const taskName = scenario?.title || 'ai_coach_rewrite';
  const userInput = [
    scenario?.customerMessage || '',
    ruleResult?.originalReply || '',
    scenario?.standardReply || ''
  ].filter(Boolean).join('\n');

  const spec = kit.buildTaskSpec({
    taskType: 'light_code',
    taskLevel: 'L2',
    taskName,
    userInput
  });

  spec.validationPolicy = kit.deriveValidationPolicy(spec);
  const pipeline = kit.buildDefaultValidatorPipeline();

  const candidate = {
    content: aiResult?.rewrittenReply || ''
  };

  const validation = await kit.runValidatorPipeline(pipeline, { taskSpec: spec, candidate });
  const evaluation = kit.evaluateCandidate({ spec, candidate, validation });

  return { spec, validation, evaluation };
}

module.exports = { runValidationKit };
