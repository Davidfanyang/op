/**
 * 知识检索服务 - 最小可用版
 * 
 * 职责：
 * 1. 按 scenario 查询 active 知识
 * 2. 按关键词查询 active 知识
 * 3. 返回前 1~3 条最相关知识
 * 4. 组装成注入文本
 * 
 * 设计原则：
 * - 最小可用，不做复杂 RAG
 * - 优先 scenario 命中，其次关键词
 * - 最多返回 3 条，避免 prompt 过大
 * - 注入格式简单稳定
 */

const { MySQLKnowledgeRepository } = require('../infrastructure/persistence/mysql/mysql-knowledge-repository');
const { getPool } = require('../infrastructure/persistence/mysql/mysql-pool');

class KnowledgeRetrievalService {
  constructor(options = {}) {
    this.pool = options.pool || getPool();
    this.knowledgeRepo = new MySQLKnowledgeRepository(this.pool);
  }

  /**
   * 检索知识并组装成注入文本
   * 
   * @param {Object} context - 检索上下文
   * @param {string} context.scenario - 场景标识（优先）
   * @param {string} context.projectId - 项目标识
   * @param {string} context.keyword - 关键词（备选）
   * @param {number} context.maxResults - 最大结果数（默认3）
   * @returns {Promise<Object>} { knowledgeText: string, knowledgeIds: string[], count: number }
   */
  async retrieveAndFormat(context = {}) {
    const {
      scenario,
      projectId,
      keyword,
      maxResults = 3
    } = context;

    // 1. 尝试按 scenario 检索
    let knowledgeList = [];
    
    if (scenario && projectId) {
      knowledgeList = await this.knowledgeRepo.findByScenario(projectId, scenario);
    }

    // 2. 如果 scenario 没命中，尝试关键词检索
    if (knowledgeList.length === 0 && keyword) {
      knowledgeList = await this.knowledgeRepo.findKnowledge({
        status: 'active',
        keyword: keyword
      }, {
        page: 1,
        pageSize: maxResults
      });
    }

    // 3. 限制结果数量
    if (knowledgeList.length > maxResults) {
      knowledgeList = knowledgeList.slice(0, maxResults);
    }

    // 4. 如果没有知识，返回空结果
    if (knowledgeList.length === 0) {
      return {
        knowledgeText: '',
        knowledgeIds: [],
        count: 0
      };
    }

    // 5. 提取 knowledge IDs
    const knowledgeIds = knowledgeList.map(k => k.id || k.knowledge_id || 'unknown');

    // 6. 组装成注入文本
    const knowledgeText = this._formatKnowledgeForInjection(knowledgeList);

    return {
      knowledgeText,
      knowledgeIds,
      count: knowledgeList.length
    };
  }

  /**
   * 将知识列表格式化为注入文本
   * 
   * @param {Array} knowledgeList - 知识列表
   * @returns {string} 格式化后的文本
   */
  _formatKnowledgeForInjection(knowledgeList) {
    let text = '\n\n【可参考知识】\n';
    
    knowledgeList.forEach((knowledge, index) => {
      text += `${index + 1}. 场景：${knowledge.scenario || '未分类'}\n`;
      text += `   标准处理：\n`;
      
      // 如果有 rules，提取关键信息
      if (knowledge.rules && typeof knowledge.rules === 'object') {
        if (knowledge.rules.required_info && knowledge.rules.required_info.length > 0) {
          text += `   - 需要收集：${knowledge.rules.required_info.join('、')}\n`;
        }
        if (knowledge.rules.forbidden && knowledge.rules.forbidden.length > 0) {
          text += `   - 禁止内容：${knowledge.rules.forbidden.join('、')}\n`;
        }
      }
      
      // 标准答案参考
      if (knowledge.standardAnswer) {
        text += `   标准答案参考：\n`;
        text += `   ${knowledge.standardAnswer}\n`;
      }
      
      text += '\n';
    });

    return text;
  }

  /**
   * 从对话文本中提取关键词（最小实现）
   * 
   * @param {string} conversationText - 对话文本
   * @returns {string|null} 提取的关键词
   */
  extractKeyword(conversationText) {
    if (!conversationText || typeof conversationText !== 'string') {
      return null;
    }

    // 最小关键词提取：取前50个字符作为匹配依据
    const text = conversationText.trim();
    if (text.length > 0) {
      return text.substring(0, 50);
    }

    return null;
  }
}

module.exports = { KnowledgeRetrievalService };
