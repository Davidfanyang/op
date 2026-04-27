/**
 * Quality Query Service - 质检记录查询服务
 * 
 * 职责：
 * 1. 提供只读质检查询接口
 * 2. 聚合 session / message / evaluation / alert 数据
 * 3. 组装稳定返回结构
 * 4. 支持多维筛选和分页
 * 
 * 严格限制：
 * - 只读接口，不涉及任何写入/修改操作
 * - 只查询 live 相关表，不混入训练数据
 * - 不修改质检状态
 */

class QualityQueryService {
  constructor(options = {}) {
    // 注入 Repository（必须从外部传入，使用 repositories/index.js 的 factory）
    if (!options.sessionsRepo || !options.messagesRepo || !options.evaluationsRepo || !options.alertsRepo) {
      throw new Error('QualityQueryService requires all repositories to be injected via options');
    }
    
    this.sessionsRepo = options.sessionsRepo;
    this.messagesRepo = options.messagesRepo;
    this.evaluationsRepo = options.evaluationsRepo;
    this.alertsRepo = options.alertsRepo;
  }

  /**
   * 查询质检会话列表
   * 
   * @param {Object} filters - 筛选条件
   * @param {string} filters.project - 项目标识
   * @param {string} filters.agent_id - 客服 ID
   * @param {string} filters.scenario - 场景
   * @param {string} filters.problem_type - known / unknown
   * @param {boolean} filters.has_alert - 是否有告警
   * @param {string} filters.alert_level - none / medium / high
   * @param {string} filters.start_time - 开始时间
   * @param {string} filters.end_time - 结束时间
   * @param {Object} pagination - 分页参数
   * @param {number} pagination.page - 页码，默认 1
   * @param {number} pagination.page_size - 每页数量，默认 20，最大 100
   * @returns {Object} { list, total, page, page_size }
   */
  async listSessions(filters = {}, pagination = {}) {
    const page = Math.max(1, parseInt(pagination.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size) || 20));

    console.log('[QualityQuery] 查询质检会话列表:', { filters, page, pageSize });

    // 查询 session 列表
    const sessionsResult = await this.sessionsRepo.findMany(filters, { page, limit: pageSize });

    // 为每个 session 补充统计信息
    const list = [];
    for (const session of (sessionsResult.items || [])) {
      // 查询该 session 的消息数量
      const messages = await this.messagesRepo.findBySessionId(session.sessionId) || [];
      const messageCount = messages.length;

      // 查询该 session 的质检记录
      const evaluations = await this.evaluationsRepo.findBySessionId(session.sessionId) || [];
      const evaluationCount = evaluations.length;

      // 获取最新的场景和问题类型
      let latestScenario = null;
      let latestProblemType = null;
      let hasAlert = false;
      let highestAlertLevel = 'none';
      let hasUnknownProblem = false; // 是否有 unknown 问题

      if (evaluations && evaluations.length > 0) {
        // 按时间排序，取最新的
        const sortedEvals = evaluations.sort((a, b) => 
          new Date(b.createdAt) - new Date(a.createdAt)
        );
        const latestEval = sortedEvals[0];
        latestScenario = latestEval.scenario || null;
        latestProblemType = latestEval.problemType || null;

        // 检查是否有 unknown 问题（任一 evaluation 是 unknown 即可）
        hasUnknownProblem = evaluations.some(e => e.problemType === 'unknown');

        // 检查是否有告警
        const alertEvals = evaluations.filter(e => e.hasAlert);
        hasAlert = alertEvals.length > 0;

        // 获取最高告警等级
        const alertLevels = evaluations
          .filter(e => e.alertLevel && e.alertLevel !== 'none')
          .map(e => e.alertLevel);
        
        if (alertLevels.includes('high')) {
          highestAlertLevel = 'high';
        } else if (alertLevels.includes('medium')) {
          highestAlertLevel = 'medium';
        }
      }

      // 应用筛选条件
      if (filters.scenario && latestScenario !== filters.scenario) {
        continue;
      }
      // problem_type 筛选：只要 session 中有任意一个 evaluation 匹配即可
      if (filters.problem_type) {
        if (filters.problem_type === 'unknown' && !hasUnknownProblem) {
          continue;
        }
        if (filters.problem_type === 'known' && !evaluations.some(e => e.problemType === 'known')) {
          continue;
        }
      }
      if (filters.has_alert !== undefined) {
        const hasAlertFilter = filters.has_alert === true || filters.has_alert === 'true';
        if (hasAlert !== hasAlertFilter) {
          continue;
        }
      }
      if (filters.alert_level && highestAlertLevel !== filters.alert_level) {
        continue;
      }

      list.push({
        session_id: session.sessionId || '',
        project: session.project || 'default',
        chat_id: session.chatId || null,
        agent_id: session.agentId || null,
        status: session.status || 'active',
        message_count: messageCount,
        evaluation_count: evaluationCount,
        latest_scenario: latestScenario,
        latest_problem_type: latestProblemType,
        has_alert: hasAlert,
        highest_alert_level: highestAlertLevel,
        started_at: session.startedAt ? session.startedAt.toISOString() : null,
        updated_at: session.updatedAt ? session.updatedAt.toISOString() : null
      });
    }

    return {
      list,
      total: list.length, // 简化实现，实际应该由数据库层返回准确总数
      page,
      page_size: pageSize
    };
  }

  /**
   * 查询质检会话详情
   * 
   * @param {string} sessionId - 会话 ID
   * @returns {Object} { session, messages, evaluations, alerts }
   */
  async getSessionDetail(sessionId) {
    console.log('[QualityQuery] 查询质检会话详情:', sessionId);

    // 查询 session 基本信息
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      return null;
    }

    // 查询消息列表
    const messages = await this.messagesRepo.findBySessionId(sessionId);
    const formattedMessages = messages.map(msg => ({
      id: msg.messageId,
      message_id: msg.messageId,
      role: msg.role,
      sender_id: msg.senderId,
      sender_name: msg.senderName,
      content: msg.content,
      timestamp: msg.timestamp.toISOString()
    }));

    // 查询质检记录
    const evaluations = await this.evaluationsRepo.findBySessionId(sessionId);
    const formattedEvaluations = evaluations.map(eval_ => ({
      id: eval_.evaluationId,
      message_id: eval_.messageId,
      current_reply: eval_.currentReply,
      scenario: eval_.scenario,
      stage: eval_.stage,
      judgement: eval_.judgement,
      summary: eval_.summary,
      confidence: eval_.confidence,
      problem_type: eval_.problemType,
      need_review: eval_.needReview,
      classify_reason: eval_.classifyReason,
      has_alert: eval_.hasAlert,
      alert_level: eval_.alertLevel,
      created_at: eval_.createdAt.toISOString()
    }));

    // 查询告警记录
    const alerts = await this.alertsRepo.findBySessionId(sessionId);
    const formattedAlerts = alerts.map(alert => ({
      id: alert.id,
      evaluation_id: alert.evaluationId,
      message_id: alert.messageId,
      alert_level: alert.alertLevel,
      alert_type: alert.alertType,
      alert_reason: alert.alertReason,
      status: alert.status,
      created_at: alert.createdAt.toISOString()
    }));

    return {
      session: {
        session_id: session.sessionId,
        project: session.project,
        chat_id: session.chatId,
        agent_id: session.agentId,
        status: session.status,
        started_at: session.startedAt.toISOString(),
        updated_at: session.updatedAt.toISOString()
      },
      messages: formattedMessages,
      evaluations: formattedEvaluations,
      alerts: formattedAlerts
    };
  }

  /**
   * 查询单条质检结果详情
   * 
   * @param {string} evaluationId - 质检记录 ID
   * @returns {Object} { evaluation, alerts }
   */
  async getEvaluationDetail(evaluationId) {
    console.log('[QualityQuery] 查询质检结果详情:', evaluationId);

    // 查询质检记录
    const evaluation = await this.evaluationsRepo.findById(evaluationId);
    if (!evaluation) {
      return null;
    }

    // 查询关联的告警记录
    const alerts = await this.alertsRepo.findBySessionId(evaluation.sessionId);
    const relatedAlerts = alerts
      .filter(a => a.evaluationId === evaluationId)
      .map(alert => ({
        id: alert.id,
        evaluation_id: alert.evaluationId,
        message_id: alert.messageId,
        alert_level: alert.alertLevel,
        alert_type: alert.alertType,
        alert_reason: alert.alertReason,
        status: alert.status,
        created_at: alert.createdAt.toISOString()
      }));

    return {
      evaluation: {
        id: evaluation.evaluationId,
        session_id: evaluation.sessionId,
        message_id: evaluation.messageId,
        project: evaluation.project,
        current_reply: evaluation.currentReply,
        input_payload: evaluation.inputPayload,
        output_payload: evaluation.outputPayload,
        scenario: evaluation.scenario,
        stage: evaluation.stage,
        judgement: evaluation.judgement,
        summary: evaluation.summary,
        confidence: evaluation.confidence,
        problem_type: evaluation.problemType,
        need_review: evaluation.needReview,
        classify_reason: evaluation.classifyReason,
        has_alert: evaluation.hasAlert,
        alert_level: evaluation.alertLevel,
        created_at: evaluation.createdAt.toISOString()
      },
      alerts: relatedAlerts
    };
  }

  /**
   * 查询告警列表
   * 
   * @param {Object} filters - 筛选条件
   * @param {string} filters.project - 项目标识
   * @param {string} filters.agent_id - 客服 ID
   * @param {string} filters.alert_level - medium / high
   * @param {string} filters.alert_type - risk / unknown / quality / compliance
   * @param {string} filters.status - open
   * @param {string} filters.start_time - 开始时间
   * @param {string} filters.end_time - 结束时间
   * @param {Object} pagination - 分页参数
   * @returns {Object} { list, total, page, page_size }
   */
  async listAlerts(filters = {}, pagination = {}) {
    const page = Math.max(1, parseInt(pagination.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size) || 20));

    console.log('[QualityQuery] 查询告警列表:', { filters, page, pageSize });

    // 查询告警列表
    const alertsResult = await this.alertsRepo.findMany(filters, { page, limit: pageSize });

    // 为每个告警补充 session 信息
    const list = [];
    for (const alert of alertsResult.items) {
      // 查询关联的 session 获取 project 和 agent_id
      const session = await this.sessionsRepo.findById(alert.sessionId);
      
      // 应用筛选条件
      if (filters.project && session && session.project !== filters.project) {
        continue;
      }
      if (filters.agent_id && session && session.agentId !== filters.agent_id) {
        continue;
      }
      // alert_type 筛选由 repository 层处理，但这里需要确保生效
      if (filters.alert_type && alert.alertType !== filters.alert_type) {
        continue;
      }

      list.push({
        alert_id: alert.id,
        evaluation_id: alert.evaluationId,
        session_id: alert.sessionId,
        message_id: alert.messageId,
        project: session ? session.project : null,
        agent_id: session ? session.agentId : null,
        alert_level: alert.alertLevel,
        alert_type: alert.alertType,
        alert_reason: alert.alertReason,
        status: alert.status,
        created_at: alert.createdAt.toISOString()
      });
    }

    return {
      list,
      total: alertsResult.total,
      page,
      page_size: pageSize
    };
  }

  /**
   * 查询质检基础统计
   * 
   * @param {Object} filters - 筛选条件
   * @param {string} filters.project - 项目标识
   * @param {string} filters.agent_id - 客服 ID
   * @param {string} filters.start_time - 开始时间
   * @param {string} filters.end_time - 结束时间
   * @returns {Object} 统计数据
   */
  async getQualityStats(filters = {}) {
    console.log('[QualityQuery] 查询质检统计:', filters);

    // 查询所有 session
    const allSessions = await this.sessionsRepo.findMany(filters, { page: 1, limit: 10000 });
    
    // 过滤 session
    let filteredSessions = allSessions.items;
    if (filters.project) {
      filteredSessions = filteredSessions.filter(s => s.project === filters.project);
    }
    if (filters.agent_id) {
      filteredSessions = filteredSessions.filter(s => s.agentId === filters.agent_id);
    }

    const totalSessions = filteredSessions.length;

    // 统计消息、质检记录、告警
    let totalMessages = 0;
    let totalEvaluations = 0;
    let knownCount = 0;
    let unknownCount = 0;
    let alertCount = 0;
    let highAlertCount = 0;
    let mediumAlertCount = 0;

    const scenarioMap = {};
    const agentMap = {};

    for (const session of filteredSessions) {
      // 统计消息
      const messages = await this.messagesRepo.findBySessionId(session.sessionId);
      totalMessages += messages.length;

      // 统计质检记录
      const evaluations = await this.evaluationsRepo.findBySessionId(session.sessionId);
      totalEvaluations += evaluations.length;

      // 统计 known/unknown
      for (const eval_ of evaluations) {
        if (eval_.problemType === 'known') {
          knownCount++;
        } else if (eval_.problemType === 'unknown') {
          unknownCount++;
        }

        // 统计告警
        if (eval_.hasAlert) {
          alertCount++;
          if (eval_.alertLevel === 'high') {
            highAlertCount++;
          } else if (eval_.alertLevel === 'medium') {
            mediumAlertCount++;
          }
        }

        // 统计场景分布
        if (eval_.scenario) {
          scenarioMap[eval_.scenario] = (scenarioMap[eval_.scenario] || 0) + 1;
        }
      }

      // 统计客服分布
      if (session.agentId) {
        if (!agentMap[session.agentId]) {
          agentMap[session.agentId] = {
            agent_id: session.agentId,
            session_count: 0,
            evaluation_count: 0,
            unknown_count: 0,
            alert_count: 0
          };
        }
        agentMap[session.agentId].session_count++;
        agentMap[session.agentId].evaluation_count += evaluations.length;
        agentMap[session.agentId].unknown_count += evaluations.filter(e => e.problemType === 'unknown').length;
        agentMap[session.agentId].alert_count += evaluations.filter(e => e.hasAlert).length;
      }
    }

    // 转换场景分布为数组
    const scenarioDistribution = Object.entries(scenarioMap)
      .map(([scenario, count]) => ({ scenario, count }))
      .sort((a, b) => b.count - a.count);

    // 转换客服分布为数组
    const agentDistribution = Object.values(agentMap)
      .sort((a, b) => b.session_count - a.session_count);

    return {
      total_sessions: totalSessions,
      total_messages: totalMessages,
      total_evaluations: totalEvaluations,
      known_count: knownCount,
      unknown_count: unknownCount,
      alert_count: alertCount,
      high_alert_count: highAlertCount,
      medium_alert_count: mediumAlertCount,
      scenario_distribution: scenarioDistribution,
      agent_distribution: agentDistribution
    };
  }
}

// 只导出类，不导出单例（必须由外部注入 repositories）
module.exports = QualityQueryService;
