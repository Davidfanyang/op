function createMemorySessionStore() {
  const sessions = new Map();
  
  return {
    reset(chatId) {
      const session = { 
        step: 'idle', 
        projectId: 'default',
        mode: 'training',
        index: -1,
        scenario: null, 
        customerMessage: '',
        history: [],
        lastEvaluation: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      sessions.set(chatId, session);
      return session;
    },
    
    get(chatId) {
      return sessions.get(chatId) || null;
    },
    
    set(chatId, session) {
      session.updatedAt = new Date().toISOString();
      sessions.set(chatId, session);
      return session;
    },
    
    clear(chatId) {
      sessions.delete(chatId);
    },
    
    // 获取所有会话（用于调试/监控）
    getAll() {
      return Array.from(sessions.entries()).map(([chatId, session]) => ({
        chatId,
        ...session
      }));
    },
    
    // 获取会话数量
    size() {
      return sessions.size;
    }
  };
}

module.exports = { createMemorySessionStore };
