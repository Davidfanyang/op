/**
 * 已知/未知问题分流服务（未知问题判定标准固化版）
 * 
 * 职责：
 * 1. 接收实时质检分析结果
 * 2. 根据固定标准判断 known / unknown
 * 3. 输出标准分流对象
 * 4. 不负责审核
 * 5. 不负责知识库入库
 * 6. 不负责建议答案生成
 * 
 * 严格约束：
 * - 分流属于底座职责，不属于分析引擎职责
 * - unknown 代表"系统当前未稳定覆盖"，不是"客服说得差"
 * - 必须多维判断，不能只靠单一字段
 * - 优先保证 unknown 的质量，标准偏保守
 * - 判定必须可解释（classify_reason 不可为空）
 * 
 * 判定输入：
 * - scenario / stage / judgement / summary / analysis / confidence
 * 
 * 判定输出：
 * - problem_type: known / unknown
 * - need_review: true / false
 * - classify_reason: 判定原因（不可为空）
 * 
 * 判定优先级（固定顺序）：
 * 第一步：场景是否明确
 * 第二步：分析结果是否完整
 * 第三步：confidence 是否达标
 * 第四步：规则是否可承接（如已实现）
 * 
 * unknown 条件（任一满足即可）：
 * - scenario 为空/unknown/other/不在有效场景集
 * - judgement/summary/analysis 不完整
 * - confidence < 0.7
 * - 规则无法承接
 * 
 * known 条件（必须同时满足）：
 * - scenario 明确
 * - judgement/summary/analysis 完整
 * - confidence >= 0.7
 * - 规则可承接
 */

// 有效场景集合（从 scenarios.json 加载）
const VALID_SCENARIOS = require('../data/scenarios.json').map(s => s.id);

// 置信度阈值
const CONFIDENCE_THRESHOLD = 0.7;

// 模糊场景占位值
const FUZZY_SCENARIOS = ['unknown', 'other', '', null, undefined];

// 规则 Repository
const { defaultRepo: rulesRepo } = require('../repositories/impl/file-rules-repository');

class ProblemClassifierService {
  /**
   * 分类问题为 known 或 unknown
   * 
   * @param {Object} evaluationResult - 实时质检分析结果（扁平化结构）
   * @param {string} projectId - 项目标识
   * @param {Object} rules - 当前规则对象（可选，预留）
   * @returns {Promise<Object>} 分流结果 { problem_type, need_review, classify_reason, ruleMatchStatus, matchedRuleIds, matchedRuleTopics, ruleCoverageSource }
   */
  async classifyProblem(evaluationResult, projectId = 'default', rules = {}) {
    console.log('[ProblemClassifier] 开始分类问题:', {
      projectId,
      scenario: evaluationResult.scenario,
      confidence: evaluationResult.confidence
    });

    // 提取关键字段（必须使用扁平化结构）
    const {
      scenario,
      stage,
      judgement,
      summary,
      analysis,
      confidence
    } = evaluationResult;

    // 规则承接检查（新增真实逻辑）
    const ruleMatchResult = await this._checkRulesMatch(scenario, evaluationResult, rules);

    // 按照固定优先级进行判定
    // 第一步：判断场景是否明确
    const scenarioClear = this._isScenarioClear(scenario);
    if (!scenarioClear) {
      // 场景不明确，但检查规则是否能承接
      if (ruleMatchResult.matched) {
        console.log('[ProblemClassifier] 判定为 known：场景不明确但规则可承接', ruleMatchResult);
        return this._buildKnownResult(ruleMatchResult);
      }
      const reason = this._getScenarioFailureReason(scenario);
      console.log('[ProblemClassifier] 判定为 unknown：场景无法识别', { scenario, reason });
      return this._buildUnknownResult(reason, ruleMatchResult);
    }
    
    // 第二步：判断分析结果是否完整
    const analysisComplete = this._isAnalysisComplete({ judgement, summary, analysis });
    if (!analysisComplete) {
      // 分析不完整，但检查规则是否能承接
      if (ruleMatchResult.matched) {
        console.log('[ProblemClassifier] 判定为 known：分析不完整但规则可承接', ruleMatchResult);
        return this._buildKnownResult(ruleMatchResult);
      }
      const reason = this._getAnalysisFailureReason({ judgement, summary, analysis });
      console.log('[ProblemClassifier] 判定为 unknown：分析结果不完整', { reason });
      return this._buildUnknownResult(reason, ruleMatchResult);
    }
    
    // 第三步：判断 confidence 是否达标
    const confidencePass = this._isConfidencePass(confidence);
    if (!confidencePass) {
      // confidence 不达标，但检查规则是否能承接
      if (ruleMatchResult.matched) {
        console.log('[ProblemClassifier] 判定为 known：confidence 不达标但规则可承接', ruleMatchResult);
        return this._buildKnownResult(ruleMatchResult);
      }
      console.log('[ProblemClassifier] 判定为 unknown：置信度不足', { confidence });
      return this._buildUnknownResult('置信度不足', ruleMatchResult);
    }
    
    // 第四步：结合 rules 命中结果（真实逻辑）
    if (!ruleMatchResult.matched) {
      console.log('[ProblemClassifier] 判定为 unknown：规则无法承接', { scenario, ruleMatchResult });
      return this._buildUnknownResult('当前规则无法承接该问题', ruleMatchResult);
    }

    // 所有条件都满足，判定为 known
    console.log('[ProblemClassifier] 判定为 known：场景明确，分析结果完整，置信度达标，规则可承接');
    return this._buildKnownResult(ruleMatchResult);
  }

  /**
   * 构建 known 结果（包含规则匹配信息）
   */
  _buildKnownResult(ruleMatchResult) {
    return {
      problem_type: 'known',
      need_review: false,
      classify_reason: '场景明确，分析结果完整，置信度达标',
      ruleMatchStatus: ruleMatchResult.matched ? 'matched' : 'not_checked',
      matchedRuleIds: ruleMatchResult.matchedRules ? ruleMatchResult.matchedRules.map(r => r.id) : [],
      matchedRuleTopics: ruleMatchResult.matchedRules ? ruleMatchResult.matchedRules.map(r => r.topic) : [],
      ruleCoverageSource: ruleMatchResult.matchLevel || 'none'
    };
  }

  /**
   * 构建 unknown 结果（包含规则匹配信息）
   */
  _buildUnknownResult(reason, ruleMatchResult) {
    return {
      problem_type: 'unknown',
      need_review: true,
      classify_reason: reason,
      ruleMatchStatus: ruleMatchResult.matched ? 'matched' : 'not_matched',
      matchedRuleIds: ruleMatchResult.matchedRules ? ruleMatchResult.matchedRules.map(r => r.id) : [],
      matchedRuleTopics: ruleMatchResult.matchedRules ? ruleMatchResult.matchedRules.map(r => r.topic) : [],
      ruleCoverageSource: ruleMatchResult.matchLevel || 'none'
    };
  }

  /**
   * 判断场景是否明确
   * 
   * 条件：
   * - scenario 非空
   * - scenario 不是 unknown
   * - scenario 不是 other
   * - scenario 不是模糊占位值
   * - scenario 在有效场景集中
   */
  _isScenarioClear(scenario) {
    // 检查是否为模糊占位值
    if (FUZZY_SCENARIOS.includes(scenario)) {
      return false;
    }

    // 检查是否在有效场景集中
    if (!VALID_SCENARIOS.includes(scenario)) {
      return false;
    }

    return true;
  }

  /**
   * 获取场景判定失败的具体原因
   */
  _getScenarioFailureReason(scenario) {
    if (FUZZY_SCENARIOS.includes(scenario)) {
      return '场景无法识别';
    }
    return '场景不在当前项目有效场景范围内';
  }

  /**
   * 判断分析结果是否完整
   * 
   * 条件：
   * - judgement 有值
   * - summary 有值
   * - analysis 存在且不是空对象
   * - analysis 仅有空数组也应视为不完整
   */
  _isAnalysisComplete({ judgement, summary, analysis }) {
    // judgement 必须有值
    if (!judgement || judgement.trim() === '') {
      return false;
    }

    // summary 必须有值
    if (!summary || summary.trim() === '') {
      return false;
    }

    // analysis 必须存在且不是空对象
    if (!analysis || typeof analysis !== 'object') {
      return false;
    }

    // 检查 analysis 是否为空对象
    if (Object.keys(analysis).length === 0) {
      return false;
    }

    // 检查 analysis 是否仅包含空数组（无法提供有效分析信息）
    const hasValidContent = Object.values(analysis).some(value => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== null && value !== undefined && value !== '';
    });

    if (!hasValidContent) {
      return false;
    }

    return true;
  }

  /**
   * 获取分析结果不完整的具体原因
   */
  _getAnalysisFailureReason({ judgement, summary, analysis }) {
    if (!judgement || judgement.trim() === '') {
      return '缺少 judgement 核心信息';
    }
    if (!summary || summary.trim() === '') {
      return '缺少 summary 核心信息';
    }
    if (!analysis || typeof analysis !== 'object' || Object.keys(analysis).length === 0) {
      return 'analysis 为空或缺失';
    }
    return '分析结果不完整';
  }

  /**
   * 判断置信度是否达标
   * 
   * 条件：
   * - confidence >= 0.7
   */
  _isConfidencePass(confidence) {
    if (confidence === null || confidence === undefined) {
      return false;
    }

    return confidence >= CONFIDENCE_THRESHOLD;
  }

  /**
   * 检查规则匹配情况（真实实现 - 三层命中逻辑）
   * 
   * 命中逻辑：
   * 1. 主题标题精确命中
   * 2. 关键词组合命中
   * 3. 产品域 + 场景域兜底命中
   * 
   * 判定原则：
   * - 只要 FAQ、流程、话术任一维可稳定承接，即判 matched
   * - 仅当场景、FAQ、流程、话术全部不命中时，才允许判 not_matched
   * 
   * @param {string} scenario - 场景 ID
   * @param {Object} evaluationResult - 完整评估结果（用于提取额外信息）
   * @param {Object} rules - 预留规则对象
   * @returns {Object} { matched, matchedRules, matchLevel }
   */
  async _checkRulesMatch(scenario, evaluationResult = {}, rules = {}) {
    try {
      // 获取所有规则
      const allRules = await rulesRepo.getAllRules();
      if (!allRules || allRules.length === 0) {
        console.log('[ProblemClassifier] 规则库为空，跳过规则匹配');
        return { matched: false, matchedRules: [], matchLevel: 'none' };
      }

      const matchedRules = [];
      let matchLevel = 'none';

      // 第一层：主题标题精确命中
      if (scenario) {
        const exactMatch = allRules.find(r => r.id === scenario);
        if (exactMatch) {
          matchedRules.push(exactMatch);
          matchLevel = 'topic_exact';
          console.log('[ProblemClassifier] 规则命中 - 第一层：主题标题精确命中', { ruleId: exactMatch.id, topic: exactMatch.topic });
          return { matched: true, matchedRules, matchLevel };
        }
      }

      // 第二层：关键词组合命中
      const summary = evaluationResult.summary || '';
      const judgement = evaluationResult.judgement || '';
      const searchText = (summary + ' ' + judgement).toLowerCase();

      if (searchText.trim()) {
        const keywordMatches = allRules.filter(rule => {
          // 匹配规则关键词
          const keywordMatch = rule.keywords.some(keyword => 
            searchText.includes(keyword.toLowerCase())
          );
          
          // 匹配规则同义词
          const synonymMatch = rule.synonyms.some(synonym => 
            searchText.includes(synonym.toLowerCase())
          );

          // 匹配客户问题示例
          const questionMatch = rule.customerMessage && 
            searchText.includes(rule.customerMessage.toLowerCase().substring(0, 20));

          return keywordMatch || synonymMatch || questionMatch;
        });

        if (keywordMatches.length > 0) {
          matchedRules.push(...keywordMatches.slice(0, 3)); // 最多取3条
          matchLevel = 'keyword';
          console.log('[ProblemClassifier] 规则命中 - 第二层：关键词组合命中', { 
            count: keywordMatches.length, 
            topRules: keywordMatches.slice(0, 3).map(r => r.id) 
          });
          return { matched: true, matchedRules: matchedRules.slice(0, 3), matchLevel };
        }
      }

      // 第三层：产品域 + 场景域兜底命中
      if (scenario) {
        // 提取产品域
        const product = this._extractProductFromScenario(scenario);
        if (product && product !== 'unknown') {
          const productRules = allRules.filter(r => r.product === product);
          if (productRules.length > 0) {
            // 产品域兜底：取前3条相关规则
            matchedRules.push(...productRules.slice(0, 3));
            matchLevel = 'product_fallback';
            console.log('[ProblemClassifier] 规则命中 - 第三层：产品域兜底命中', { 
              product, 
              count: productRules.length 
            });
            return { matched: true, matchedRules: matchedRules.slice(0, 3), matchLevel };
          }
        }
      }

      // 全部未命中
      console.log('[ProblemClassifier] 规则匹配失败：场景、FAQ、流程、话术全部不命中');
      return { matched: false, matchedRules: [], matchLevel: 'none' };

    } catch (error) {
      console.error('[ProblemClassifier] 规则匹配异常:', error);
      return { matched: false, matchedRules: [], matchLevel: 'error' };
    }
  }

  /**
   * 从场景 ID 提取产品域
   */
  _extractProductFromScenario(scenario) {
    if (scenario.startsWith('lanton')) {
      return 'lanton';
    } else if (scenario.startsWith('pai')) {
      return 'pai';
    }
    return 'unknown';
  }
}

// 导出类和单例
const defaultClassifier = new ProblemClassifierService();

module.exports = {
  ProblemClassifierService,
  defaultClassifier
};
