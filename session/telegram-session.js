const { createMemorySessionStore } = require('./session-store');

const store = createMemorySessionStore();

function resetSession(chatId) {
  return store.reset(chatId);
}

function getSession(chatId) {
  return store.get(chatId);
}

function clearSession(chatId) {
  return store.clear(chatId);
}

module.exports = {
  resetSession,
  getSession,
  clearSession
};
