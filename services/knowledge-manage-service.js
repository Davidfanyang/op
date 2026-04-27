/**
 * 知识库管理服务
 * 
 * 职责：
 * 1. 查询知识列表（支持筛选和分页）
 * 2. 查询知识详情
 * 3. 新增人工知识
 * 4. 更新知识生成新版本
 * 5. 停用知识
 * 6. 查询版本历史
 * 
 * 设计原则：
 * - 更新不覆盖旧数据，创建新版本
 * - 停用不物理删除，只标记 status=deprecated
 * - 返回稳定 JSON 结构，不直接暴露数据库字段
 */

const { MySQLKnowledgeRepository } = require('../infrastructure/persistence/mysql/mysql-knowledge-repository');
const { getPool } = require('../infrastructure/persistence/mysql/mysql-pool');

// 知识状态常量
const KNOWLEDGE_STATUS = {
  ACTIVE: 'active',
  DEPRECATED: 'deprecated'
};

// 允许的状态值
const ALLOWED_STATUS = ['active', 'deprecated'];

class KnowledgeManageService {
  constructor(options = {}) {
    this.pool = options.pool || getPool();
    this.knowledgeRepo = new MySQLKnowledgeRepository(this.pool);
  }

  /**
   * 查询知识库列表
   * @param {Object} filters - 筛选条件
   * @param {string} filters.project - 项目标识
   * @param {string} filters.scenario - 场景
   * @param {string} filters.status - 状态 active/deprecated
   * @param {string} filters.keyword - 关键词搜索
   * @param {Object} pagination - 分页参数
   * @param {number} pagination.page - 页码
   * @param {number} pagination.pageSize - 每页数量
   * @returns {Promise<Object>} 列表结果
   */
  async listKnowledge(filters = {}, pagination = {}) {
    try {
      // 解析筛选条件
      const queryFilters = {};
      if (filters.project) {
        queryFilters.projectId = filters.project;
      }
      if (filters.scenario) {
        queryFilters.scenario = filters.scenario;
      }
      if (filters.status) {
        // 验证状态值
        if (!ALLOWED_STATUS.includes(filters.status)) {
          return {
            success: false,
            error: 'INVALID_STATUS',
            message: `状态值必须是 ${ALLOWED_STATUS.join(' 或 ')}`
          };
        }
        queryFilters.status = filters.status;
      }
      if (filters.keyword) {
        queryFilters.keyword = filters.keyword;
      }

      // 解析分页参数
      const page = Math.max(1, parseInt(pagination.page) || 1);
      const pageSize = Math.min(Math.max(1, parseInt(pagination.pageSize) || 20), 100);

      // 查询列表和总数
      const [list, total] = await Promise.all([
        this.knowledgeRepo.findKnowledge(queryFilters, { page, pageSize }),
        this.knowledgeRepo.countKnowledge(queryFilters)
      ]);

      // 转换为稳定返回结构
      const formattedList = list.map(k => this._formatKnowledgeItem(k));

      return {
        success: true,
        data: {
          list: formattedList,
          total,
          page,
          pageSize
        }
      };
    } catch (error) {
      console.error('[KnowledgeManageService] listKnowledge 失败:', error);
      return {
        success: false,
        error: 'LIST_KNOWLEDGE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * 查询知识详情
   * @param {string} knowledgeId - 知识 ID
   * @returns {Promise<Object>} 知识详情
   */
  async getKnowledgeDetail(knowledgeId) {
    try {
      const knowledge = await this.knowledgeRepo.findById(knowledgeId);
      
      if (!knowledge) {
        return {
          success: false,
          error: 'KNOWLEDGE_NOT_FOUND',
          message: '知识不存在'
        };
      }

      return {
        success: true,
        data: this._formatKnowledgeDetail(knowledge)
      };
    } catch (error) {
      console.error('[KnowledgeManageService] getKnowledgeDetail 失败:', error);
      return {
        success: false,
        error: 'GET_KNOWLEDGE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * 新增人工知识
   * @param {Object} data - 知识数据
   * @param {string} data.project - 项目标识
   * @param {string} data.scenario - 场景名称
   * @param {Array} data.questionAliases - 问题表达集合
   * @param {string} data.standardAnswer - 标准答案
   * @param {Object} data.rules - 规则对象
   * @param {string} data.operatorId - 操作人 ID
   * @returns {Promise<Object>} 创建结果
   */
  async createKnowledge(data) {
    try {
      // 必填字段校验
      const validationError = this._validateCreateKnowledge(data);
      if (validationError) {
        return validationError;
      }

      // 构建知识数据
      const knowledgeData = {
        projectId: data.project,
        scenario: data.scenario,
        questionAliases: data.questionAliases,
        standardAnswer: data.standardAnswer,
        rules: data.rules || {
          keywords: [],
          required_info: [],
          forbidden: []
        },
        // 人工创建时来源字段为 null
        sourceReviewId: null,
        sourceSuggestionId: null,
        sourceEvaluationId: null,
        sourceSessionId: null,
        version: 1,
        status: KNOWLEDGE_STATUS.ACTIVE
      };

      // 创建知识记录
      const knowledge = await this.knowledgeRepo.create(knowledgeData);

      return {
        success: true,
        data: {
          knowledgeId: knowledge.knowledgeId,
          version: knowledge.version,
          status: knowledge.status
        }
      };
    } catch (error) {
      console.error('[KnowledgeManageService] createKnowledge 失败:', error);
      return {
        success: false,
        error: 'CREATE_KNOWLEDGE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * 更新知识并生成新版本
   * @param {Object} data - 更新数据
   * @param {string} data.knowledgeId - 原知识 ID
   * @param {Array} data.questionAliases - 新问题表达集合（可选）
   * @param {string} data.standardAnswer - 新标准答案（可选）
   * @param {Object} data.rules - 新规则对象（可选）
   * @param {string} data.operatorId - 操作人 ID
   * @param {string} data.updateReason - 更新原因
   * @returns {Promise<Object>} 更新结果
   */
  async updateKnowledge(data) {
    try {
      // 必填字段校验
      const validationError = this._validateUpdateKnowledge(data);
      if (validationError) {
        return validationError;
      }

      // 查询原知识
      const oldKnowledge = await this.knowledgeRepo.findById(data.knowledgeId);
      if (!oldKnowledge) {
        return {
          success: false,
          error: 'KNOWLEDGE_NOT_FOUND',
          message: '知识不存在'
        };
      }

      // 获取 root_id 和当前最大版本号
      const rootId = oldKnowledge.rootId || oldKnowledge.knowledgeId;
      const maxVersion = await this.knowledgeRepo.getMaxVersionByRootId(rootId);
      const newVersion = maxVersion + 1;

      // 将旧版本标记为 deprecated（如果是 active 状态）
      if (oldKnowledge.status === KNOWLEDGE_STATUS.ACTIVE) {
        await this.knowledgeRepo.updateStatus(data.knowledgeId, KNOWLEDGE_STATUS.DEPRECATED);
      }

      // 创建新版本
      const newKnowledgeData = {
        rootId: rootId,
        projectId: oldKnowledge.projectId,
        scenario: oldKnowledge.scenario,
        questionAliases: data.questionAliases || oldKnowledge.questionAliases,
        standardAnswer: data.standardAnswer || oldKnowledge.standardAnswer,
        rules: data.rules || oldKnowledge.rules,
        // 继承来源信息
        sourceReviewId: oldKnowledge.sourceReviewId,
        sourceSuggestionId: oldKnowledge.sourceSuggestionId,
        sourceEvaluationId: oldKnowledge.sourceEvaluationId,
        sourceSessionId: oldKnowledge.sourceSessionId,
        version: newVersion,
        status: KNOWLEDGE_STATUS.ACTIVE
      };

      const newKnowledge = await this.knowledgeRepo.create(newKnowledgeData);

      return {
        success: true,
        data: {
          knowledgeId: newKnowledge.knowledgeId,
          rootId: newKnowledge.rootId,
          version: newKnowledge.version,
          status: newKnowledge.status
        }
      };
    } catch (error) {
      console.error('[KnowledgeManageService] updateKnowledge 失败:', error);
      return {
        success: false,
        error: 'UPDATE_KNOWLEDGE_FAILED',
        message: error.message
      };
    }
  }

  /**
   * 停用知识
   * @param {Object} data - 停用数据
   * @param {string} data.knowledgeId - 知识 ID
   * @param {string} data.status - 新状态（只能是 deprecated）
   * @param {string} data.operatorId - 操作人 ID
   * @param {string} data.reason - 停用原因
   * @returns {Promise<Object>} 停用结果
   */
  async changeKnowledgeStatus(data) {
    try {
      // 校验状态值
      if (!data.knowledgeId) {
        return {
          success: false,
          error: 'INVALID_PARAMS',
          message: 'knowledgeId 不能为空'
        };
      }

      if (!data.status || !ALLOWED_STATUS.includes(data.status)) {
        return {
          success: false,
          error: 'INVALID_STATUS',
          message: `状态值必须是 ${ALLOWED_STATUS.join(' 或 ')}`
        };
      }

      // 查询知识是否存在
      const knowledge = await this.knowledgeRepo.findById(data.knowledgeId);
      if (!knowledge) {
        return {
          success: false,
          error: 'KNOWLEDGE_NOT_FOUND',
          message: '知识不存在'
        };
      }

      // 更新状态
      const updatedKnowledge = await this.knowledgeRepo.updateStatus(data.knowledgeId, data.status);

      return {
        success: true,
        data: {
          knowledgeId: updatedKnowledge.knowledgeId,
          status: updatedKnowledge.status
        }
      };
    } catch (error) {
      console.error('[KnowledgeManageService] changeKnowledgeStatus 失败:', error);
      return {
        success: false,
        error: 'CHANGE_STATUS_FAILED',
        message: error.message
      };
    }
  }

  /**
   * 查询版本历史
   * @param {string} knowledgeId - 知识 ID（任意版本的 ID 即可）
   * @returns {Promise<Object>} 版本历史
   */
  async getKnowledgeVersions(knowledgeId) {
    try {
      // 查询当前知识
      const knowledge = await this.knowledgeRepo.findById(knowledgeId);
      if (!knowledge) {
        return {
          success: false,
          error: 'KNOWLEDGE_NOT_FOUND',
          message: '知识不存在'
        };
      }

      // 获取 root_id
      const rootId = knowledge.rootId || knowledge.knowledgeId;

      // 查询所有版本
      const versions = await this.knowledgeRepo.findKnowledgeVersions(rootId);

      // 格式化版本列表
      const formattedVersions = versions.map(v => ({
        knowledgeId: v.knowledgeId,
        version: v.version,
        status: v.status,
        standardAnswer: v.standardAnswer,
        questionAliases: v.questionAliases,
        createdAt: v.createdAt
      }));

      return {
        success: true,
        data: {
          rootId: rootId,
          versions: formattedVersions
        }
      };
    } catch (error) {
      console.error('[KnowledgeManageService] getKnowledgeVersions 失败:', error);
      return {
        success: false,
        error: 'GET_VERSIONS_FAILED',
        message: error.message
      };
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 校验新增知识参数
   */
  _validateCreateKnowledge(data) {
    if (!data.project) {
      return {
        success: false,
        error: 'INVALID_PARAMS',
        message: 'project 不能为空'
      };
    }

    if (!data.scenario) {
      return {
        success: false,
        error: 'INVALID_PARAMS',
        message: 'scenario 不能为空'
      };
    }

    if (!data.questionAliases || !Array.isArray(data.questionAliases) || data.questionAliases.length === 0) {
      return {
        success: false,
        error: 'INVALID_PARAMS',
        message: 'questionAliases 必须是非空数组'
      };
    }

    if (!data.standardAnswer || data.standardAnswer.trim() === '') {
      return {
        success: false,
        error: 'INVALID_PARAMS',
        message: 'standardAnswer 不能为空'
      };
    }

    if (!data.operatorId) {
      return {
        success: false,
        error: 'INVALID_PARAMS',
        message: 'operatorId 不能为空'
      };
    }

    return null;
  }

  /**
   * 校验更新知识参数
   */
  _validateUpdateKnowledge(data) {
    if (!data.knowledgeId) {
      return {
        success: false,
        error: 'INVALID_PARAMS',
        message: 'knowledgeId 不能为空'
      };
    }

    if (!data.operatorId) {
      return {
        success: false,
        error: 'INVALID_PARAMS',
        message: 'operatorId 不能为空'
      };
    }

    // 至少必须更新以下任一项
    const hasUpdate = data.questionAliases || data.standardAnswer || data.rules;
    if (!hasUpdate) {
      return {
        success: false,
        error: 'INVALID_PARAMS',
        message: '至少必须更新 question_aliases、standard_answer 或 rules 中的任一项'
      };
    }

    return null;
  }

  /**
   * 格式化知识列表项
   */
  _formatKnowledgeItem(knowledge) {
    return {
      knowledgeId: knowledge.knowledgeId,
      project: knowledge.projectId,
      scenario: knowledge.scenario,
      questionAliases: knowledge.questionAliases,
      standardAnswer: knowledge.standardAnswer,
      version: knowledge.version,
      status: knowledge.status,
      createdAt: knowledge.createdAt,
      updatedAt: knowledge.updatedAt
    };
  }

  /**
   * 格式化知识详情
   */
  _formatKnowledgeDetail(knowledge) {
    return {
      knowledgeId: knowledge.knowledgeId,
      project: knowledge.projectId,
      scenario: knowledge.scenario,
      questionAliases: knowledge.questionAliases,
      standardAnswer: knowledge.standardAnswer,
      rules: knowledge.rules,
      source: {
        sourceReviewId: knowledge.sourceReviewId,
        sourceSuggestionId: knowledge.sourceSuggestionId,
        sourceEvaluationId: knowledge.sourceEvaluationId,
        sourceSessionId: knowledge.sourceSessionId
      },
      version: knowledge.version,
      status: knowledge.status,
      createdAt: knowledge.createdAt,
      updatedAt: knowledge.updatedAt
    };
  }
}

// 导出类和默认实例
module.exports = {
  KnowledgeManageService,
  defaultService: new KnowledgeManageService()
};
