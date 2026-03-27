const scenarios = require('../data/scenarios.json');

function getScenarioById(id) {
  return scenarios.find((item) => item.id === id) || null;
}

module.exports = { getScenarioById };
