const path = require('path');
const { pathToFileURL } = require('url');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

let cachedRouteTask = null;

async function getRouteTask() {
  if (cachedRouteTask) return cachedRouteTask;
  const routerEntry = path.resolve(__dirname, '..', '..', 'claw-router', 'dist', 'router.js');
  const mod = await import(pathToFileURL(routerEntry).href);
  cachedRouteTask = mod.routeTask;
  return cachedRouteTask;
}

async function runFallbackRoute({ taskName, userInput, systemPrompt, requestId, approved }) {
  const routeTask = await getRouteTask();
  return routeTask({
    requestId: requestId || `req_${Date.now()}`,
    taskName,
    userInput,
    approved,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userInput }
    ]
  });
}

module.exports = { runFallbackRoute };
