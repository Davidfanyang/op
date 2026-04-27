/**
 * 分析引擎输入协议校验器 v1.0
 * 
 * 职责：
 * 1. 校验输入是否符合《分析引擎输入协议定义稿》标准
 * 2. 确保所有必填字段存在且类型正确
 * 3. 确保逻辑一致性（entry_type、conversation、current_reply 等）
 * 
 * 标准协议结构：
 * {
 *   project: string,           // 必填
 *   conversation: array,       // 必填 [{role: "user"|"agent", content: string}]
 *   current_reply: string,     // 必填
 *   metadata: object,          // 必填 {source, session_id, agent_id, timestamp, entry_type}
 *   rules: object              // 必填（无规则时传 {}）
 * }
 */

/**
 * 校验分析引擎输入协议
 * @param {Object} input - 待校验的输入对象
 * @throws {Error} 如果校验失败，抛出详细错误信息
 */
function validateProtocol(input) {
  const errors = [];
  
  // 1. 顶层结构校验
  if (!input || typeof input !== 'object') {
    throw new Error('INVALID_PROTOCOL: input 必须是对象');
  }
  
  // 2. project 校验
  if (!input.project || typeof input.project !== 'string') {
    errors.push('project 必须为非空字符串');
  }
  
  // 3. conversation 校验
  if (!Array.isArray(input.conversation) || input.conversation.length === 0) {
    errors.push('conversation 必须为非空数组');
  } else {
    input.conversation.forEach((turn, index) => {
      if (!turn || typeof turn !== 'object') {
        errors.push(`conversation[${index}] 必须是对象`);
        return;
      }
      
      if (!turn.role || !['user', 'agent'].includes(turn.role)) {
        errors.push(`conversation[${index}].role 必须是 "user" 或 "agent"，当前值: "${turn.role}"`);
      }
      
      if (!turn.content || typeof turn.content !== 'string') {
        errors.push(`conversation[${index}].content 必须为非空字符串`);
      }
    });
  }
  
  // 4. current_reply 校验
  if (!input.current_reply || typeof input.current_reply !== 'string') {
    errors.push('current_reply 必须为非空字符串');
  }
  
  // 5. metadata 校验
  if (!input.metadata || typeof input.metadata !== 'object') {
    errors.push('metadata 必须为对象');
  } else {
    const requiredMetadata = ['source', 'session_id', 'agent_id', 'timestamp', 'entry_type'];
    requiredMetadata.forEach(field => {
      if (!input.metadata[field] || input.metadata[field] === '') {
        errors.push(`metadata.${field} 为必填字段，不能为空`);
      }
    });
    
    // entry_type 值校验
    if (input.metadata.entry_type && !['training', 'live_monitor'].includes(input.metadata.entry_type)) {
      errors.push(`metadata.entry_type 必须是 "training" 或 "live_monitor"，当前值: "${input.metadata.entry_type}"`);
    }
    
    // source 值建议校验（不阻塞）
    if (input.metadata.source && !['tg_training', 'tg_live', 'api', 'unknown'].includes(input.metadata.source)) {
      console.warn(`[ProtocolValidator] 警告: metadata.source 推荐值为 tg_training/tg_live/api/unknown，当前值: "${input.metadata.source}"`);
    }
  }
  
  // 6. rules 校验
  if (input.rules === undefined || input.rules === null || typeof input.rules !== 'object') {
    errors.push('rules 必须为对象（无规则时传 {}）');
  }
  
  // 7. 逻辑一致性校验
  if (input.metadata && input.metadata.entry_type) {
    // training 模式必须有 project
    if (input.metadata.entry_type === 'training' && (!input.project || input.project === '')) {
      errors.push('training 模式必须提供有效的 project');
    }
    
    // live_monitor 模式也必须有 project
    if (input.metadata.entry_type === 'live_monitor' && (!input.project || input.project === '')) {
      errors.push('live_monitor 模式必须提供有效的 project');
    }
  }
  
  // 8. current_reply 与 conversation 一致性校验
  if (input.current_reply && input.conversation && input.conversation.length > 0) {
    const lastTurn = input.conversation[input.conversation.length - 1];
    if (lastTurn && lastTurn.role === 'agent' && lastTurn.content !== input.current_reply) {
      // 警告但不阻塞：最后一条 agent 回复与 current_reply 不一致
      console.warn(
        `[ProtocolValidator] 警告: conversation 最后一条 agent 回复与 current_reply 不一致\n` +
        `conversation: "${lastTurn.content.substring(0, 50)}..."\n` +
        `current_reply: "${input.current_reply.substring(0, 50)}..."`
      );
    }
  }
  
  // 抛出校验结果
  if (errors.length > 0) {
    throw new Error(`INVALID_PROTOCOL: ${errors.join('; ')}`);
  }
}

/**
 * 快速校验（不抛异常，返回错误列表）
 * @param {Object} input - 待校验的输入对象
 * @returns {Array} 错误列表，为空表示校验通过
 */
function validateProtocolFast(input) {
  const errors = [];
  
  try {
    validateProtocol(input);
  } catch (err) {
    // 提取错误信息
    const message = err.message.replace('INVALID_PROTOCOL: ', '');
    errors.push(...message.split('; '));
  }
  
  return errors;
}

module.exports = {
  validateProtocol,
  validateProtocolFast
};
