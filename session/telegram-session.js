const { createMemorySessionStore } = require('./session-store');

const store = createMemorySessionStore();

function resetSession(chatId) {
  return store.reset(chatId);
}

function getSession(chatId) {
  return store.get(chatId);
}

function setSession(chatId, session) {
  return store.set(chatId, session);
}

function clearSession(chatId) {
  return store.clear(chatId);
}

function getAllSessions() {
  return store.getAll();
}

function getSessionCount() {
  return store.size();
}

module.exports = {
  resetSession,
  getSession,
  setSession,
  clearSession,
  getAllSessions,
  getSessionCount
};
