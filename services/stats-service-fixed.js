/**
 * Stats Service - 基础统计服务（修复版）
 * 
 * 为 Web 看板提供训练、质检、告警、审核、知识库的基础统计能力
 */

const { getPool } = require('../infrastructure/persistence/mysql/mysql-pool');

class StatsService {
  constructor(options = {}) {
    this.pool = options.pool || getPool();
  }

  /**
   * 6.1 总览统计
   */
  async getOverview(filters = {}) {
    const { project, startTime, endTime } = this._parseFilters(filters);

    const trainingStats = await this._aggregateTrainingOverview(project, startTime, endTime);
    const qualityStats = await this._aggregateQualityOverview(project, startTime, endTime);
    const alertStats = await this._aggregateAlertOverview(project, startTime, endTime);
    const reviewStats = await this._aggregateReviewOverview(project, startTime, endTime);
    const knowledgeStats = await this._aggregateKnowledgeOverview(project, startTime, endTime);

    return {
      code: 0,
      data: {
        training: trainingStats,
        quality: qualityStats,
        alerts: alertStats,
        reviews: reviewStats,
        knowledge: knowledgeStats
      }
    };
  }

  /**
   * 6.2 训练统计
   */
  async getTrainingStats(filters = {}) {
    const { project, agentId, scenarioId, startTime, endTime } = this._parseFilters(filters);

    const conditions = [];
    const params = [];

    if (project) { conditions.push('project = ?'); params.push(project); }
    if (agentId) { conditions.push('agent_id = ?'); params.push(agentId); }
    if (scenarioId) { conditions.push('scenario_id = ?'); params.push(scenarioId); }
    if (startTime) { conditions.push('started_at >= ?'); params.push(startTime); }
    if (endTime) { conditions.push('started_at <= ?'); params.push(endTime); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalSql = `
      SELECT 
        COUNT(*) as total_sessions,
        SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) as finished_sessions,
        SUM(CASE WHEN status IN ('cancelled', 'interrupted') THEN 1 ELSE 0 END) as interrupted_sessions,
        AVG(total_rounds) as avg_rounds
      FROM training_sessions
      ${whereClause}
    `;
    const totalStats = await this.pool.queryOne(totalSql, params);

    const roundsSql = `
      SELECT COUNT(*) as total_rounds
      FROM training_round_results trr
      INNER JOIN training_sessions ts ON trr.session_id = ts.session_id
      ${conditions.length > 0 ? 'WHERE ' + conditions.map(c => c.replace('ts.', '')).join(' AND ') : ''}
    `;
    const roundsResult = await this.pool.queryOne(roundsSql, params);

    const scenarioSql = `
      SELECT scenario_id, scenario_title, COUNT(*) as count
      FROM training_sessions ${whereClause}
      GROUP BY scenario_id, scenario_title ORDER BY count DESC
    `;
    const scenarioDistribution = await this.pool.queryMany(scenarioSql, params);

    const agentSql = `
      SELECT agent_id, COUNT(*) as session_count, COALESCE(SUM(total_rounds), 0) as round_count
      FROM training_sessions ${whereClause}
      GROUP BY agent_id ORDER BY session_count DESC
    `;
    const agentDistribution = await this.pool.queryMany(agentSql, params);

    return {
      code: 0,
      data: {
        total_sessions: totalStats.total_sessions || 0,
        finished_sessions: totalStats.finished_sessions || 0,
        interrupted_sessions: totalStats.interrupted_sessions || 0,
        total_rounds: roundsResult.total_rounds || 0,
        avg_rounds: parseFloat((totalStats.avg_rounds || 0).toFixed(2)),
        scenario_distribution: scenarioDistribution,
        agent_distribution: agentDistribution
      }
    };
  }

  /**
   * 6.3 质检统计
   */
  async getQualityStats(filters = {}) {
    const { project, agentId, scenario, problemType, startTime, endTime } = this._parseFilters(filters);

    const sessionConditions = [];
    const sessionParams = [];

    if (project) { sessionConditions.push('project = ?'); sessionParams.push(project); }
    if (agentId) { sessionConditions.push('agent_id = ?'); sessionParams.push(agentId); }
    if (startTime) { sessionConditions.push('started_at >= ?'); sessionParams.push(startTime); }
    if (endTime) { sessionConditions.push('started_at <= ?'); sessionParams.push(endTime); }

    const sessionWhere = sessionConditions.length > 0 ? `WHERE ${sessionConditions.join(' AND ')}` : '';

    const sessionsSql = `SELECT COUNT(*) as total_sessions FROM live_sessions ${sessionWhere}`;
    const sessionsStats = await this.pool.queryOne(sessionsSql, sessionParams);

    const messagesSql = `
      SELECT COUNT(*) as total_messages
      FROM live_messages lm
      INNER JOIN live_sessions ls ON lm.session_id = ls.session_id
      ${sessionConditions.length > 0 ? 'WHERE ' + sessionConditions.join(' AND ') : ''}
    `;
    const messagesResult = await this.pool.queryOne(messagesSql, sessionParams);

    const evalConditions = [];
    const evalParams = [];

    if (project) { evalConditions.push('le.project = ?'); evalParams.push(project); }
    if (agentId) { evalConditions.push('ls.agent_id = ?'); evalParams.push(agentId); }
    if (scenario) { evalConditions.push('le.scenario = ?'); evalParams.push(scenario); }
    if (problemType === 'unknown') { evalConditions.push("JSON_EXTRACT(le.output_payload, '$.problemType') = 'unknown'"); }
    if (problemType === 'known') { evalConditions.push("JSON_EXTRACT(le.output_payload, '$.problemType') = 'known'"); }
    if (startTime) { evalConditions.push('le.created_at >= ?'); evalParams.push(startTime); }
    if (endTime) { evalConditions.push('le.created_at <= ?'); evalParams.push(endTime); }

    const evalJoin = agentId ? 'INNER JOIN live_sessions ls ON le.session_id = ls.session_id' : '';
    const evalWhere = evalConditions.length > 0 ? `WHERE ${evalConditions.join(' AND ')}` : '';

    const evalSql = `SELECT COUNT(*) as total_evaluations FROM live_evaluations le ${evalJoin} ${evalWhere}`;
    const evalStats = await this.pool.queryOne(evalSql, evalParams);

    const knownSql = `
      SELECT COUNT(*) as known_count FROM live_evaluations le ${evalJoin} ${evalWhere}
      ${evalConditions.length > 0 ? 'AND' : 'WHERE'} JSON_EXTRACT(le.output_payload, '$.problemType') = 'known'
    `;
    const unknownSql = `
      SELECT COUNT(*) as unknown_count FROM live_evaluations le ${evalJoin} ${evalWhere}
      ${evalConditions.length > 0 ? 'AND' : 'WHERE'} JSON_EXTRACT(le.output_payload, '$.problemType') = 'unknown'
    `;

    const knownResult = await this.pool.queryOne(knownSql, evalParams);
    const unknownResult = await this.pool.queryOne(unknownSql, evalParams);

    const totalEvals = evalStats.total_evaluations || 0;
    const knownCount = knownResult.known_count || 0;
    const unknownCount = unknownResult.unknown_count || 0;
    const unknownRate = totalEvals > 0 ? parseFloat((unknownCount / totalEvals).toFixed(4)) : 0;

    const scenarioDistSql = `
      SELECT scenario, COUNT(*) as count FROM live_evaluations le ${evalJoin} ${evalWhere}
      GROUP BY scenario ORDER BY count DESC
    `;
    const scenarioDistribution = await this.pool.queryMany(scenarioDistSql, evalParams);

    return {
      code: 0,
      data: {
        total_sessions: sessionsStats.total_sessions || 0,
        total_messages: messagesResult.total_messages || 0,
        total_evaluations: totalEvals,
        known_count: knownCount,
        unknown_count: unknownCount,
        unknown_rate: unknownRate,
        scenario_distribution: scenarioDistribution,
        agent_distribution: []
      }
    };
  }

  /**
   * 6.4 告警统计
   */
  async getAlertStats(filters = {}) {
    const { project, agentId, alertLevel, alertType, startTime, endTime } = this._parseFilters(filters);

    const conditions = [];
    const params = [];

    if (project) { conditions.push('a.project = ?'); params.push(project); }
    if (agentId) { conditions.push('ls.agent_id = ?'); params.push(agentId); }
    if (alertLevel) { conditions.push('a.alert_level = ?'); params.push(alertLevel); }
    if (alertType) { conditions.push('a.alert_type = ?'); params.push(alertType); }
    if (startTime) { conditions.push('a.created_at >= ?'); params.push(startTime); }
    if (endTime) { conditions.push('a.created_at <= ?'); params.push(endTime); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const joinClause = agentId ? 'INNER JOIN live_sessions ls ON a.session_id = ls.session_id' : '';

    const totalSql = `SELECT COUNT(*) as total_alerts FROM alerts a ${joinClause} ${whereClause}`;
    const totalStats = await this.pool.queryOne(totalSql, params);

    const highSql = `SELECT COUNT(*) as high_alert_count FROM alerts a ${joinClause} ${whereClause} ${conditions.length > 0 ? 'AND' : 'WHERE'} a.alert_level = 'high'`;
    const mediumSql = `SELECT COUNT(*) as medium_alert_count FROM alerts a ${joinClause} ${whereClause} ${conditions.length > 0 ? 'AND' : 'WHERE'} a.alert_level = 'medium'`;

    const highResult = await this.pool.queryOne(highSql, params);
    const mediumResult = await this.pool.queryOne(mediumSql, params);

    const typeSql = `SELECT alert_type, COUNT(*) as count FROM alerts a ${joinClause} ${whereClause} GROUP BY alert_type ORDER BY count DESC`;
    const typeDistribution = await this.pool.queryMany(typeSql, params);

    return {
      code: 0,
      data: {
        total_alerts: totalStats.total_alerts || 0,
        high_alert_count: highResult.high_alert_count || 0,
        medium_alert_count: mediumResult.medium_alert_count || 0,
        alert_type_distribution: typeDistribution,
        agent_distribution: []
      }
    };
  }

  /**
   * 6.5 审核统计
   */
  async getReviewStats(filters = {}) {
    const { project, reviewerId, startTime, endTime } = this._parseFilters(filters);

    const conditions = [];
    const params = [];

    if (project) { conditions.push('r.project_id = ?'); params.push(project); }
    if (reviewerId) { conditions.push('r.reviewer_id = ?'); params.push(reviewerId); }
    if (startTime) { conditions.push('r.created_at >= ?'); params.push(startTime); }
    if (endTime) { conditions.push('r.created_at <= ?'); params.push(endTime); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const pendingSql = `
      SELECT COUNT(*) as pending_count FROM suggestions s
      WHERE s.review_status = 'pending_review'
      ${project ? 'AND s.project_id = ?' : ''}
      ${startTime ? 'AND s.created_at >= ?' : ''}
      ${endTime ? 'AND s.created_at <= ?' : ''}
    `;
    const pendingParams = [];
    if (project) pendingParams.push(project);
    if (startTime) pendingParams.push(startTime);
    if (endTime) pendingParams.push(endTime);
    const pendingStats = await this.pool.queryOne(pendingSql, pendingParams);

    const reviewSql = `
      SELECT 
        SUM(CASE WHEN r.review_action = 'approve' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN r.review_action = 'modify_and_approve' THEN 1 ELSE 0 END) as modified_approved_count,
        SUM(CASE WHEN r.review_action = 'reject' THEN 1 ELSE 0 END) as rejected_count
      FROM reviews r ${whereClause}
    `;
    const reviewStats = await this.pool.queryOne(reviewSql, params);

    const approvedCount = reviewStats.approved_count || 0;
    const modifiedApprovedCount = reviewStats.modified_approved_count || 0;
    const rejectedCount = reviewStats.rejected_count || 0;
    const totalReviewed = approvedCount + modifiedApprovedCount + rejectedCount;
    const approvalRate = totalReviewed > 0 ? parseFloat(((approvedCount + modifiedApprovedCount) / totalReviewed).toFixed(4)) : 0;

    const reviewerSql = `
      SELECT reviewer_id, COUNT(*) as review_count,
        SUM(CASE WHEN r.review_action = 'approve' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN r.review_action = 'modify_and_approve' THEN 1 ELSE 0 END) as modified_approved_count,
        SUM(CASE WHEN r.review_action = 'reject' THEN 1 ELSE 0 END) as rejected_count
      FROM reviews r ${whereClause} GROUP BY reviewer_id ORDER BY review_count DESC
    `;
    const reviewerDistribution = await this.pool.queryMany(reviewerSql, params);

    return {
      code: 0,
      data: {
        pending_count: pendingStats.pending_count || 0,
        approved_count: approvedCount,
        modified_approved_count: modifiedApprovedCount,
        rejected_count: rejectedCount,
        total_reviewed: totalReviewed,
        approval_rate: approvalRate,
        reviewer_distribution: reviewerDistribution
      }
    };
  }

  /**
   * 6.6 知识库统计
   */
  async getKnowledgeStats(filters = {}) {
    const { project, scenario, status, startTime, endTime } = this._parseFilters(filters);

    const conditions = [];
    const params = [];

    if (project) { conditions.push('project_id = ?'); params.push(project); }
    if (scenario) { conditions.push('scenario = ?'); params.push(scenario); }
    if (status) { conditions.push('status = ?'); params.push(status); }
    if (startTime) { conditions.push('created_at >= ?'); params.push(startTime); }
    if (endTime) { conditions.push('created_at <= ?'); params.push(endTime); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const totalSql = `
      SELECT 
        COUNT(*) as total_knowledge,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status = 'deprecated' THEN 1 ELSE 0 END) as deprecated_count
      FROM knowledge_base ${whereClause}
    `;
    const totalStats = await this.pool.queryOne(totalSql, params);

    const scenarioSql = `SELECT scenario, COUNT(*) as count FROM knowledge_base ${whereClause} GROUP BY scenario ORDER BY count DESC`;
    const scenarioDistribution = await this.pool.queryMany(scenarioSql, params);

    const sourceSql = `
      SELECT CASE WHEN source_review_id IS NOT NULL THEN 'review' ELSE 'manual' END as source, COUNT(*) as count
      FROM knowledge_base ${whereClause} GROUP BY source ORDER BY count DESC
    `;
    const sourceDistribution = await this.pool.queryMany(sourceSql, params);

    return {
      code: 0,
      data: {
        total_knowledge: totalStats.total_knowledge || 0,
        active_count: totalStats.active_count || 0,
        deprecated_count: totalStats.deprecated_count || 0,
        scenario_distribution: scenarioDistribution,
        source_distribution: sourceDistribution
      }
    };
  }

  /**
   * 6.7 时间趋势统计
   */
  async getTrendStats(filters = {}) {
    const { project, type, startTime, endTime, granularity } = filters;

    if (granularity && !['day', 'week'].includes(granularity)) {
      return { code: 1, error: 'invalid_granularity' };
    }
    if (type && !['training', 'quality', 'alerts', 'reviews', 'all'].includes(type)) {
      return { code: 1, error: 'invalid_stats_type' };
    }

    const gran = granularity || 'day';
    const targetType = type || 'all';
    const items = [];

    if (targetType === 'all' || targetType === 'quality') {
      const conditions = [];
      const params = [];
      if (project) { conditions.push('project = ?'); params.push(project); }
      if (startTime) { conditions.push('created_at >= ?'); params.push(startTime); }
      if (endTime) { conditions.push('created_at <= ?'); params.push(endTime); }
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const sql = `
        SELECT DATE(created_at) as date,
          COUNT(DISTINCT session_id) as quality_sessions,
          COUNT(*) as evaluations,
          SUM(CASE WHEN JSON_EXTRACT(output_payload, '$.problemType') = 'unknown' THEN 1 ELSE 0 END) as unknown_count
        FROM live_evaluations ${whereClause}
        GROUP BY date ORDER BY date ASC
      `;
      const rows = await this.pool.queryMany(sql, params);
      rows.forEach(row => {
        let item = items.find(i => i.date === row.date);
        if (!item) { item = { date: row.date }; items.push(item); }
        item.quality_sessions = row.quality_sessions;
        item.evaluations = row.evaluations;
        item.unknown_count = row.unknown_count;
      });
    }

    items.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    items.forEach(item => {
      item.training_sessions = item.training_sessions || 0;
      item.quality_sessions = item.quality_sessions || 0;
      item.evaluations = item.evaluations || 0;
      item.unknown_count = item.unknown_count || 0;
      item.alert_count = item.alert_count || 0;
      item.review_count = item.review_count || 0;
    });

    return { code: 0, data: { granularity: gran, items } };
  }

  /**
   * 6.8 客服维度统计
   */
  async getAgentStats(filters = {}) {
    const { project, agentId, startTime, endTime } = this._parseFilters(filters);

    const conditions = [];
    const params = [];

    if (project) { conditions.push('project = ?'); params.push(project); }
    if (agentId) { conditions.push('agent_id = ?'); params.push(agentId); }
    if (startTime) { conditions.push('started_at >= ?'); params.push(startTime); }
    if (endTime) { conditions.push('started_at <= ?'); params.push(endTime); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const trainingSql = `
      SELECT agent_id, COUNT(*) as training_sessions, COALESCE(SUM(total_rounds), 0) as training_rounds
      FROM training_sessions ${whereClause} GROUP BY agent_id
    `;
    const trainingStats = await this.pool.queryMany(trainingSql, params);

    const items = trainingStats.map(row => ({
      agent_id: row.agent_id,
      training_sessions: row.training_sessions || 0,
      training_rounds: row.training_rounds || 0,
      quality_sessions: 0,
      quality_evaluations: 0,
      unknown_count: 0,
      alert_count: 0,
      high_alert_count: 0
    }));

    return { code: 0, data: { items } };
  }

  /**
   * 辅助方法：解析筛选条件
   */
  _parseFilters(filters) {
    return {
      project: filters.project || null,
      agentId: filters.agent_id || filters.agentId || null,
      scenarioId: filters.scenario_id || filters.scenarioId || null,
      scenario: filters.scenario || null,
      problemType: filters.problem_type || filters.problemType || null,
      alertLevel: filters.alert_level || filters.alertLevel || null,
      alertType: filters.alert_type || filters.alertType || null,
      reviewerId: filters.reviewer_id || filters.reviewerId || null,
      status: filters.status || null,
      startTime: filters.start_time || filters.startTime || null,
      endTime: filters.end_time || filters.endTime || null,
      type: filters.type || null,
      granularity: filters.granularity || null
    };
  }

  /**
   * 辅助方法：聚合训练总览
   */
  async _aggregateTrainingOverview(project, startTime, endTime) {
    const conditions = [];
    const params = [];

    if (project) { conditions.push('project = ?'); params.push(project); }
    if (startTime) { conditions.push('started_at >= ?'); params.push(startTime); }
    if (endTime) { conditions.push('started_at <= ?'); params.push(endTime); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        COUNT(*) as total_sessions,
        SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) as finished_sessions,
        SUM(CASE WHEN status IN ('cancelled', 'interrupted') THEN 1 ELSE 0 END) as interrupted_sessions
      FROM training_sessions ${whereClause}
    `;
    const result = await this.pool.queryOne(sql, params);

    return {
      total_sessions: result.total_sessions || 0,
      finished_sessions: result.finished_sessions || 0,
      interrupted_sessions: result.interrupted_sessions || 0,
      total_rounds: 0
    };
  }

  async _aggregateQualityOverview(project, startTime, endTime) {
    const conditions = [];
    const params = [];

    if (project) { conditions.push('project = ?'); params.push(project); }
    if (startTime) { conditions.push('created_at >= ?'); params.push(startTime); }
    if (endTime) { conditions.push('created_at <= ?'); params.push(endTime); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(*) as total_evaluations,
        SUM(CASE WHEN JSON_EXTRACT(output_payload, '$.problemType') = 'known' THEN 1 ELSE 0 END) as known_count,
        SUM(CASE WHEN JSON_EXTRACT(output_payload, '$.problemType') = 'unknown' THEN 1 ELSE 0 END) as unknown_count
      FROM live_evaluations ${whereClause}
    `;
    const result = await this.pool.queryOne(sql, params);

    return {
      total_sessions: result.total_sessions || 0,
      total_evaluations: result.total_evaluations || 0,
      known_count: result.known_count || 0,
      unknown_count: result.unknown_count || 0
    };
  }

  async _aggregateAlertOverview(project, startTime, endTime) {
    const conditions = [];
    const params = [];

    if (project) { conditions.push('project = ?'); params.push(project); }
    if (startTime) { conditions.push('created_at >= ?'); params.push(startTime); }
    if (endTime) { conditions.push('created_at <= ?'); params.push(endTime); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        COUNT(*) as total_alerts,
        SUM(CASE WHEN alert_level = 'high' THEN 1 ELSE 0 END) as high_alert_count,
        SUM(CASE WHEN alert_level = 'medium' THEN 1 ELSE 0 END) as medium_alert_count
      FROM alerts ${whereClause}
    `;
    const result = await this.pool.queryOne(sql, params);

    return {
      total_alerts: result.total_alerts || 0,
      high_alert_count: result.high_alert_count || 0,
      medium_alert_count: result.medium_alert_count || 0
    };
  }

  async _aggregateReviewOverview(project, startTime, endTime) {
    const pendingSql = `
      SELECT COUNT(*) as pending_count FROM suggestions s
      WHERE s.review_status = 'pending_review'
      ${project ? 'AND s.project_id = ?' : ''}
      ${startTime ? 'AND s.created_at >= ?' : ''}
      ${endTime ? 'AND s.created_at <= ?' : ''}
    `;
    const pendingParams = [];
    if (project) pendingParams.push(project);
    if (startTime) pendingParams.push(startTime);
    if (endTime) pendingParams.push(endTime);
    const pendingStats = await this.pool.queryOne(pendingSql, pendingParams);

    const conditions = [];
    const params = [];

    if (project) { conditions.push('project_id = ?'); params.push(project); }
    if (startTime) { conditions.push('created_at >= ?'); params.push(startTime); }
    if (endTime) { conditions.push('created_at <= ?'); params.push(endTime); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        SUM(CASE WHEN review_action = 'approve' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN review_action = 'modify_and_approve' THEN 1 ELSE 0 END) as modified_approved_count,
        SUM(CASE WHEN review_action = 'reject' THEN 1 ELSE 0 END) as rejected_count
      FROM reviews ${whereClause}
    `;
    const result = await this.pool.queryOne(sql, params);

    return {
      pending_count: pendingStats.pending_count || 0,
      approved_count: result.approved_count || 0,
      modified_approved_count: result.modified_approved_count || 0,
      rejected_count: result.rejected_count || 0
    };
  }

  async _aggregateKnowledgeOverview(project, startTime, endTime) {
    const conditions = [];
    const params = [];

    if (project) { conditions.push('project_id = ?'); params.push(project); }
    if (startTime) { conditions.push('created_at >= ?'); params.push(startTime); }
    if (endTime) { conditions.push('created_at <= ?'); params.push(endTime); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT 
        COUNT(*) as total_knowledge,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status = 'deprecated' THEN 1 ELSE 0 END) as deprecated_count
      FROM knowledge_base ${whereClause}
    `;
    const result = await this.pool.queryOne(sql, params);

    return {
      total_knowledge: result.total_knowledge || 0,
      active_count: result.active_count || 0,
      deprecated_count: result.deprecated_count || 0
    };
  }
}

const defaultService = new StatsService();
module.exports = { StatsService, defaultService };
