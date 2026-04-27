/**
 * Training Queue 最小工作台
 * 
 * 目标: 让主管一打开就知道先处理谁
 * 不是 list/detail/process 命令行工具,而是真正的工作队列
 */

const mysql = require('mysql2/promise');

class TrainingWorkbench {
  constructor(dbConfig = {}) {
    this.pool = mysql.createPool({
      host: dbConfig.host || process.env.DB_HOST || 'localhost',
      user: dbConfig.user || process.env.DB_USER || 'root',
      password: dbConfig.password || process.env.DB_PASSWORD || '',
      database: dbConfig.database || process.env.DB_NAME || 'pai_dashboard'
    });
  }

  /**
   * 获取工作台视图 (核心方法)
   * 
   * 返回:
   * - 员工
   * - 场景  
   * - 分数
   * - 主要问题标签
   * - 当前状态
   * - 建议动作
   * - priority (高/中/低)
   */
  async getWorkQueue(projectId = 'default', options = {}) {
    const {
      employeeId = null,
      priority = null,
      limit = 20
    } = options;

    // 构建查询条件
    const conditions = ["r.mode = 'training'", "r.review_status = 'pending'"];
    const params = [];

    if (projectId) {
      conditions.push('r.project_id = ?');
      params.push(projectId);
    }

    if (employeeId) {
      conditions.push('r.employee_id = ?');
      params.push(employeeId);
    }

    if (priority) {
      conditions.push('r.priority = ?');
      params.push(priority);
    }

    const whereClause = conditions.join(' AND ');

    // 核心查询: 关联 evaluations 获取分数和 findings
    const sql = `
      SELECT 
        r.review_id,
        r.employee_id,
        r.session_id,
        r.alert_level,
        r.priority,
        r.problem_tags,
        r.created_at,
        e.score,
        e.scenario_id,
        e.findings_json,
        e.suggestions_json,
        e.coach_summary,
        
        -- 计算优先级 (如果未设置)
        CASE 
          WHEN r.priority IS NOT NULL THEN r.priority
          WHEN e.score < 30 THEN 'high'
          WHEN e.score < 50 THEN 'medium'
          ELSE 'low'
        END as calculated_priority,
        
        -- 提取主要问题标签
        CASE
          WHEN r.problem_tags IS NOT NULL THEN r.problem_tags
          WHEN e.findings_json LIKE '%态%度%' THEN JSON_ARRAY('态度问题')
          WHEN e.findings_json LIKE '%礼%貌%' OR e.findings_json LIKE '%话%术%' THEN JSON_ARRAY('话术问题')
          WHEN e.findings_json LIKE '%流%程%' OR e.findings_json LIKE '%规%范%' THEN JSON_ARRAY('流程问题')
          ELSE JSON_ARRAY('其他问题')
        END as extracted_tags,
        
        -- 建议动作
        CASE
          WHEN e.score < 30 THEN '需补训'
          WHEN e.score < 50 THEN '需改进'
          WHEN e.findings_json LIKE '%误%报%' OR e.findings_json LIKE '%特殊%' THEN '可放过'
          ELSE '待判断'
        END as suggested_action
        
      FROM reviews r
      LEFT JOIN evaluations e ON r.evaluation_id = e.evaluation_id
      WHERE ${whereClause}
      ORDER BY 
        CASE 
          WHEN r.priority = 'high' OR e.score < 30 THEN 1
          WHEN r.priority = 'medium' OR e.score < 50 THEN 2
          ELSE 3
        END,
        r.created_at ASC
      LIMIT ?
    `;

    params.push(limit);

    const [rows] = await this.pool.query(sql, params);

    // 格式化返回数据
    return rows.map(row => ({
      review_id: row.review_id,
      employee_id: row.employee_id,
      scenario_id: row.scenario_id,
      score: row.score ? Number(row.score) : null,
      
      // 问题标签 (解析 JSON)
      problem_tags: this.parseTags(row.extracted_tags || row.problem_tags),
      
      // 优先级
      priority: row.priority || row.calculated_priority,
      
      // 状态
      status: 'pending',
      alert_level: row.alert_level,
      
      // 建议动作
      suggested_action: row.suggested_action,
      
      // 辅助信息
      coach_summary: row.coach_summary,
      created_at: row.created_at,
      
      // 快速操作提示
      quick_actions: this.getQuickActions(row)
    }));
  }

  /**
   * 获取员工维度汇总
   */
  async getEmployeeSummary(projectId = 'default') {
    const sql = `
      SELECT 
        r.employee_id,
        COUNT(*) as total_pending,
        AVG(e.score) as avg_score,
        SUM(CASE WHEN e.score < 30 THEN 1 ELSE 0 END) as high_priority_count,
        SUM(CASE WHEN e.score >= 30 AND e.score < 50 THEN 1 ELSE 0 END) as medium_priority_count,
        SUM(CASE WHEN e.score >= 50 THEN 1 ELSE 0 END) as low_priority_count,
        
        -- 主要问题类型统计
        SUM(CASE WHEN e.findings_json LIKE '%态%度%' THEN 1 ELSE 0 END) as attitude_issues,
        SUM(CASE WHEN e.findings_json LIKE '%礼%貌%' OR e.findings_json LIKE '%话%术%' THEN 1 ELSE 0 END) as wording_issues,
        SUM(CASE WHEN e.findings_json LIKE '%流%程%' OR e.findings_json LIKE '%规%范%' THEN 1 ELSE 0 END) as process_issues
        
      FROM reviews r
      LEFT JOIN evaluations e ON r.evaluation_id = e.evaluation_id
      WHERE r.mode = 'training' 
        AND r.review_status = 'pending'
        AND r.project_id = ?
      GROUP BY r.employee_id
      ORDER BY high_priority_count DESC, avg_score ASC
    `;

    const [rows] = await this.pool.query(sql, [projectId]);

    return rows.map(row => ({
      employee_id: row.employee_id,
      total_pending: Number(row.total_pending),
      avg_score: row.avg_score ? Number(Number(row.avg_score).toFixed(1)) : null,
      priority_distribution: {
        high: Number(row.high_priority_count),
        medium: Number(row.medium_priority_count),
        low: Number(row.low_priority_count)
      },
      problem_distribution: {
        attitude: Number(row.attitude_issues),
        wording: Number(row.wording_issues),
        process: Number(row.process_issues)
      },
      // 处理建议
      action_hint: this.getEmployeeActionHint(row)
    }));
  }

  /**
   * 获取场景维度汇总
   */
  async getScenarioSummary(projectId = 'default') {
    const sql = `
      SELECT 
        e.scenario_id,
        COUNT(*) as total_pending,
        AVG(e.score) as avg_score,
        SUM(CASE WHEN e.score < 30 THEN 1 ELSE 0 END) as fail_count
        
      FROM reviews r
      LEFT JOIN evaluations e ON r.evaluation_id = e.evaluation_id
      WHERE r.mode = 'training' 
        AND r.review_status = 'pending'
        AND r.project_id = ?
      GROUP BY e.scenario_id
      ORDER BY fail_count DESC, avg_score ASC
    `;

    const [rows] = await this.pool.query(sql, [projectId]);

    return rows.map(row => ({
      scenario_id: row.scenario_id,
      total_pending: Number(row.total_pending),
      avg_score: row.avg_score ? Number(Number(row.avg_score).toFixed(1)) : null,
      fail_count: Number(row.fail_count),
      // 场景难度提示
      difficulty_hint: row.avg_score < 40 ? '困难场景' : row.avg_score < 60 ? '中等场景' : '简单场景'
    }));
  }

  /**
   * 解析标签 JSON
   */
  parseTags(tagsStr) {
    if (!tagsStr) return [];
    try {
      const parsed = typeof tagsStr === 'string' ? JSON.parse(tagsStr) : tagsStr;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * 获取快速操作提示
   */
  getQuickActions(row) {
    const score = row.score ? Number(row.score) : 50;
    const actions = [];

    if (score < 30) {
      actions.push({ action: 'needs_training', label: '需补训', reason: '分数<30,严重问题' });
    } else if (score < 50) {
      actions.push({ action: 'needs_training', label: '需改进', reason: '分数30-50,需要提升' });
    } else {
      actions.push({ action: 'passed', label: '可放过', reason: '分数>=50,可能误判' });
    }

    return actions;
  }

  /**
   * 获取员工处理建议
   */
  getEmployeeActionHint(row) {
    const highCount = Number(row.high_priority_count);
    const avgScore = row.avg_score ? Number(row.avg_score) : 60;

    if (highCount >= 3) {
      return `紧急: ${highCount}条高分问题,需立即辅导`;
    } else if (avgScore < 40) {
      return `建议: 平均分${avgScore},安排专项训练`;
    } else if (highCount >= 1) {
      return `关注: 有${highCount}条严重问题`;
    } else {
      return `正常: 按计划处理`;
    }
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = { TrainingWorkbench };
