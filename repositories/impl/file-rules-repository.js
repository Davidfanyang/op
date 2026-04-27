/**
 * Rules Repository - 文件实现（从 scenarios.json 加载）
 * 
 * 职责：
 * 1. 从 scenarios.json 加载规则数据
 * 2. 转换为结构化规则表
 * 3. 提供规则查询接口
 * 
 * 数据转换逻辑：
 * - id: 直接使用
 * - product: 从 id 前缀提取（lanton/pai）
 * - category: 从 title 推断分类
 * - topic: 直接使用 title
 * - keywords: 从 customerMessage 提取关键词
 * - synonyms: 预留空数组（后续可扩展）
 * - has_process: 根据 standardReply 是否包含流程判断
 * - has_script: 根据 standardReply 是否存在判断
 */

const { RulesRepository } = require('../rules-repository');
const scenariosData = require('../../data/scenarios.json');

class FileRulesRepository extends RulesRepository {
  constructor() {
    super();
    this.rules = this._convertScenariosToRules(scenariosData);
    console.log(`[RulesRepo] 加载规则: ${this.rules.length} 条`);
  }

  /**
   * 将 scenarios.json 转换为规则表
   */
  _convertScenariosToRules(scenarios) {
    return scenarios.map(scenario => {
      const id = scenario.id;
      const title = scenario.title;
      const customerMessage = scenario.customerMessage;
      const standardReply = scenario.standardReply;

      // 提取产品域
      const product = this._extractProduct(id);

      // 推断分类
      const category = this._inferCategory(title, customerMessage);

      // 提取关键词
      const keywords = this._extractKeywords(customerMessage, title);

      // 判断是否有流程
      const hasProcess = this._hasProcess(standardReply);

      // 判断是否有话术
      const hasScript = !!(standardReply && standardReply.trim().length > 0);

      return {
        id,
        product,
        category,
        topic: title,
        keywords,
        synonyms: [], // 预留，后续可扩展
        hasProcess,
        hasScript,
        customerMessage,
        standardReply
      };
    });
  }

  /**
   * 从规则 ID 提取产品域
   */
  _extractProduct(ruleId) {
    if (ruleId.startsWith('lanton')) {
      return 'lanton';
    } else if (ruleId.startsWith('pai')) {
      return 'pai';
    }
    return 'unknown';
  }

  /**
   * 从标题和问题推断分类
   */
  _inferCategory(title, customerMessage) {
    const text = (title + ' ' + customerMessage).toLowerCase();

    if (text.includes('转账') || text.includes('transfer')) {
      return 'transfer';
    } else if (text.includes('充值') || text.includes('deposit') || text.includes('入金')) {
      return 'deposit';
    } else if (text.includes('提现') || text.includes('withdraw') || text.includes('取现')) {
      return 'withdraw';
    } else if (text.includes('密码') || text.includes('冻结') || text.includes('安全') || text.includes('设备')) {
      return 'security';
    } else if (text.includes('下载') || text.includes('注册') || text.includes('KYC') || text.includes('认证')) {
      return 'onboarding';
    } else if (text.includes('手续费') || text.includes('费率') || text.includes('限额')) {
      return 'fee_limit';
    } else if (text.includes('异常') || text.includes('失败') || text.includes('报错') || text.includes('闪退')) {
      return 'error';
    } else if (text.includes('国际转账') || text.includes('微信') || text.includes('跨境')) {
      return 'intl_transfer';
    } else if (text.includes('快捷交易') || text.includes('USDT') || text.includes('数字货币')) {
      return 'crypto_trade';
    }

    return 'other';
  }

  /**
   * 从问题和标题提取关键词
   */
  _extractKeywords(customerMessage, title) {
    const keywords = [];
    const text = customerMessage + ' ' + title;

    // 提取关键动词
    const verbs = ['转账', '充值', '提现', '取现', '下载', '注册', '认证', '冻结', '解冻', '更换', '重置', '修改'];
    verbs.forEach(verb => {
      if (text.includes(verb)) {
        keywords.push(verb);
      }
    });

    // 提取关键名词
    const nouns = ['银行', '扫码', '密码', '验证码', '账户', '钱包', '手续费', '限额', '国际', '微信', 'USDT', '数字货币', '设备', 'KYC', '实名'];
    nouns.forEach(noun => {
      if (text.includes(noun)) {
        keywords.push(noun);
      }
    });

    // 去重
    return [...new Set(keywords)];
  }

  /**
   * 判断是否有解决流程
   */
  _hasProcess(standardReply) {
    if (!standardReply) return false;

    // 包含流程指示词
    const processIndicators = ['点击', '选择', '输入', '提供', '准备', '前往', '打开', '搜索'];
    return processIndicators.some(indicator => standardReply.includes(indicator));
  }

  async getAllRules() {
    return this.rules;
  }

  async getRuleById(ruleId) {
    return this.rules.find(r => r.id === ruleId) || null;
  }

  async getRulesByProduct(product) {
    return this.rules.filter(r => r.product === product);
  }

  async getRulesByCategory(category) {
    return this.rules.filter(r => r.category === category);
  }

  async searchRulesByKeyword(keyword) {
    const lowerKeyword = keyword.toLowerCase();
    return this.rules.filter(rule => {
      // 匹配主题
      if (rule.topic.toLowerCase().includes(lowerKeyword)) return true;
      // 匹配关键词
      if (rule.keywords.some(k => k.toLowerCase().includes(lowerKeyword))) return true;
      // 匹配同义词
      if (rule.synonyms.some(s => s.toLowerCase().includes(lowerKeyword))) return true;
      // 匹配客户问题
      if (rule.customerMessage.toLowerCase().includes(lowerKeyword)) return true;
      return false;
    });
  }

  async getRuleCount() {
    return this.rules.length;
  }
}

// 导出类和单例
const defaultRepo = new FileRulesRepository();

module.exports = {
  FileRulesRepository,
  defaultRepo
};
