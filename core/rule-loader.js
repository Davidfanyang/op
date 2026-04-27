/**
 * 规则加载器 v1.0
 * 
 * 职责：
 * 1. 加载项目规则并注入到分析引擎输入协议
 * 2. 当前从 data/standards/ 读取静态规则文件
 * 3. 后续支持从 Web API 或数据库动态加载
 * 
 * 规则对象结构：
 * {
 *   must_ask: [],          // 必须追问的信息点
 *   must_include: [],      // 回复中必须包含的关键内容
 *   forbidden: [],         // 回复中禁止出现的内容
 *   stage_rules: {}        // 不同阶段下的判断要求
 * }
 */

const fs = require('fs');
const path = require('path');

// 缓存已加载的规则，避免重复读取文件
const rulesCache = new Map();

/**
 * 加载项目规则
 * @param {string} projectId - 项目标识
 * @returns {Object} 规则对象
 */
function loadRules(projectId) {
  // 检查缓存
  if (rulesCache.has(projectId)) {
    return rulesCache.get(projectId);
  }
  
  // 默认规则结构
  const rules = {
    must_ask: [],
    must_include: [],
    forbidden: [],
    stage_rules: {}
  };
  
  try {
    // 1. 加载通用规则（standards.json）
    const standardsPath = path.resolve(__dirname, '../data/standards.json');
    if (fs.existsSync(standardsPath)) {
      const standards = JSON.parse(fs.readFileSync(standardsPath, 'utf8'));
      
      // 映射到标准规则结构
      if (standards.mustInclude) rules.must_include = standards.mustInclude;
      if (standards.forbidden) rules.forbidden = standards.forbidden;
      if (standards.mustAsk) rules.must_ask = standards.mustAsk;
      if (standards.stageRules) rules.stage_rules = standards.stageRules;
    }
    
    // 2. 加载项目特定规则（如果存在）
    const projectRulesPath = path.resolve(__dirname, `../data/standards/${projectId}.json`);
    if (fs.existsSync(projectRulesPath)) {
      const projectRules = JSON.parse(fs.readFileSync(projectRulesPath, 'utf8'));
      
      // 合并项目规则（项目规则优先级更高）
      if (projectRules.must_ask) rules.must_ask = [...rules.must_ask, ...projectRules.must_ask];
      if (projectRules.must_include) rules.must_include = [...rules.must_include, ...projectRules.must_include];
      if (projectRules.forbidden) rules.forbidden = [...rules.forbidden, ...projectRules.forbidden];
      if (projectRules.stage_rules) rules.stage_rules = { ...rules.stage_rules, ...projectRules.stage_rules };
    }
    
    // 3. 加载回复原则（reply-principles.json）
    const replyPrinciplesPath = path.resolve(__dirname, '../data/standards/reply-principles.json');
    if (fs.existsSync(replyPrinciplesPath)) {
      const principles = JSON.parse(fs.readFileSync(replyPrinciplesPath, 'utf8'));
      
      if (principles.mustInclude) {
        rules.must_include = [...new Set([...rules.must_include, ...principles.mustInclude])];
      }
      if (principles.forbidden) {
        rules.forbidden = [...new Set([...rules.forbidden, ...principles.forbidden])];
      }
    }
    
    // 4. 加载风险规则（risk-rules.json）
    const riskRulesPath = path.resolve(__dirname, '../data/standards/risk-rules.json');
    if (fs.existsSync(riskRulesPath)) {
      const riskRules = JSON.parse(fs.readFileSync(riskRulesPath, 'utf8'));
      
      if (riskRules.forbiddenWords) {
        rules.forbidden = [...new Set([...rules.forbidden, ...riskRules.forbiddenWords])];
      }
    }
    
  } catch (err) {
    console.error(`[RuleLoader] 加载规则失败 (${projectId}):`, err.message);
    // 加载失败时返回空规则，不阻塞分析流程
  }
  
  // 缓存规则
  rulesCache.set(projectId, rules);
  
  return rules;
}

/**
 * 清除规则缓存（用于测试或规则更新后）
 * @param {string} projectId - 项目标识（可选，不传则清除所有缓存）
 */
function clearRulesCache(projectId) {
  if (projectId) {
    rulesCache.delete(projectId);
  } else {
    rulesCache.clear();
  }
}

/**
 * 获取规则加载统计
 * @returns {Object} 缓存统计信息
 */
function getRulesCacheStats() {
  return {
    cacheSize: rulesCache.size,
    cachedProjects: Array.from(rulesCache.keys())
  };
}

module.exports = {
  loadRules,
  clearRulesCache,
  getRulesCacheStats
};
