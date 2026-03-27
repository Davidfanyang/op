function createMemorySessionStore() {
  const sessions = new Map();
  return {
    reset(chatId) {
      const session = { step: 'idle', scenario: null, customerMessage: '' };
      sessions.set(chatId, session);
      return session;
    },
    get(chatId) {
      if (!sessions.has(chatId)) {
        return this.reset(chatId);
      }
      return sessions.get(chatId);
    },
    clear(chatId) {
      sessions.delete(chatId);
    }
  };
}

module.exports = { createMemorySessionStore };
