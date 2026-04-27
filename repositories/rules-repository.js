/**
 * Rules Repository 接口定义
 * 
 * 职责：规则数据持久化抽象层
 * 实现方式：File / Database / Cache
 * 
 * 规则表结构（从 scenarios.json 转换）：
 * - id: 规则唯一标识
 * - product: 产品域（lanton/pai）
 * - category: 分类（转账/充值/提现/安全等）
 * - topic: 主题标题
 * - keywords: 关键词数组
 * - synonyms: 同义词数组
 * - has_process: 是否有解决流程
 * - has_script: 是否有标准话术
 * - customer_message: 客户问题示例
 * - standard_reply: 标准话术
 */

/**
 * Rule 数据结构
 * @typedef {Object} Rule
 * @property {string} id - 规则唯一标识
 * @property {string} product - 产品域：lanton / pai
 * @property {string} category - 分类
 * @property {string} topic - 主题标题
 * @property {string[]} keywords - 关键词数组
 * @property {string[]} synonyms - 同义词数组
 * @property {boolean} hasProcess - 是否有解决流程
 * @property {boolean} hasScript - 是否有标准话术
 * @property {string} customerMessage - 客户问题示例
 * @property {string} standardReply - 标准话术
 */

class RulesRepository {
  /**
   * 获取所有规则
   * @returns {Promise<Rule[]>}
   */
  async getAllRules() {
    throw new Error('Method not implemented');
  }

  /**
   * 根据 ID 获取规则
   * @param {string} ruleId
   * @returns {Promise<Rule|null>}
   */
  async getRuleById(ruleId) {
    throw new Error('Method not implemented');
  }

  /**
   * 根据产品域获取规则
   * @param {string} product
   * @returns {Promise<Rule[]>}
   */
  async getRulesByProduct(product) {
    throw new Error('Method not implemented');
  }

  /**
   * 根据分类获取规则
   * @param {string} category
   * @returns {Promise<Rule[]>}
   */
  async getRulesByCategory(category) {
    throw new Error('Method not implemented');
  }

  /**
   * 搜索规则（按关键词）
   * @param {string} keyword
   * @returns {Promise<Rule[]>}
   */
  async searchRulesByKeyword(keyword) {
    throw new Error('Method not implemented');
  }

  /**
   * 获取规则总数
   * @returns {Promise<number>}
   */
  async getRuleCount() {
    throw new Error('Method not implemented');
  }
}

module.exports = {
  RulesRepository
};
