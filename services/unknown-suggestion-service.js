/**
 * 未知问题建议答案生成服务（验收修正版）
 * 
 * 职责：
 * 1. 接收 unknown suggestion 生成请求
 * 2. 校验当前 evaluation 是否符合生成条件
 * 3. 查询 conversation、evaluation、上下文信息
 * 4. 组装 suggestion 生成输入对象
 * 5. 通过统一引擎调用入口生成建议答案
 * 6. 对返回结果做基础清洗
 * 7. 将 suggestion 入库
 * 8. 返回 suggestion 生成结果
 * 
 * 严格约束：
 * - 必须走统一引擎调用入口（evaluation-service.evaluate）
 * - 禁止直连本地模型
 * - 禁止新开第二套模型调用协议
 * - suggestion 只是草稿，不自动生效
 * - 同一 evaluation_id 只能生成一条 suggestion
 * 
 * 触发条件：
 * 1. evaluation.exists = true
 * 2. evaluation.problem_type = unknown
 * 3. evaluation_id 有效
 * 4. 当前 evaluation_id 未存在 suggestion 记录
 * 
 * 输入对象（13个必填字段）：
 * - project_id
 * - session_id
 * - message_id
 * - evaluation_id
 * - entry_source
 * - agent_id
 * - scenario
 * - conversation
 * - current_reply
 * - evaluation_summary
 * - classify_reason
 * - findings
 * - generated_at
 * 
 * 输出固定值：
 * - source_type = unknown_auto_generated
 * - status = active
 * - review_status = pending_review
 */

const { evaluate } = require('./evaluation-service');

// 根据环境变量选择 Repository 类型
function getSuggestionsRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    const factory = getDefaultFactory();
    return factory.getSuggestionsRepository();
  }
  const { defaultRepo } = require('../repositories/impl/file-suggestions-repository');
  return defaultRepo;
}

function getLiveEvaluationsRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    const factory = getDefaultFactory();
    return factory.getLiveEvaluationRepository();
  }
  const { defaultRepo } = require('../repositories/impl/file-live-evaluations-repository');
  return defaultRepo;
}

function getLiveMessagesRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    const factory = getDefaultFactory();
    return factory.getLiveMessageRepository();
  }
  const { defaultRepo } = require('../repositories/impl/file-live-messages-repository');
  return defaultRepo;
}

function getLiveSessionsRepo() {
  if (process.env.REPOSITORY_TYPE === 'mysql') {
    const { getDefaultFactory } = require('../repositories');
    const factory = getDefaultFactory();
    return factory.getLiveSessionRepository();
  }
  const { defaultRepo } = require('../repositories/impl/file-live-sessions-repository');
  return defaultRepo;
}

const suggestionsRepo = getSuggestionsRepo();
const liveEvaluationsRepo = getLiveEvaluationsRepo();
const liveMessagesRepo = getLiveMessagesRepo();
const liveSessionsRepo = getLiveSessionsRepo();

class UnknownSuggestionService {
  constructor(options = {}) {
    this.suggestionsRepo = options.suggestionsRepo || suggestionsRepo;
    this.evaluationsRepo = options.evaluationsRepo || liveEvaluationsRepo;
    this.messagesRepo = options.messagesRepo || liveMessagesRepo;
    this.sessionsRepo = options.sessionsRepo || liveSessionsRepo;
  }

  /**
   * 为 unknown 问题生成建议答案（主入口）
   * 
   * @param {string} evaluationId - 评估 ID
   * @returns {Promise<Object>} 建议答案生成结果
   */
  async generateSuggestionByEvaluationId(evaluationId) {
    console.log('[SuggestionService] 开始生成建议答案:', { evaluationId });

    // 步骤1: 查询 evaluation
    const evaluation = await this._validateEvaluation(evaluationId);
    if (!evaluation) {
      return {
        success: false,
        reason: 'evaluation_not_found',
        evaluation_id: evaluationId
      };
    }

    // 步骤2: 检查 suggestion 是否已存在
    const exists = await this.suggestionsRepo.existsByEvaluationId(evaluationId);
    if (exists) {
      console.log('[SuggestionService] suggestion 已存在，跳过生成:', evaluationId);
      const existing = await this.suggestionsRepo.findByEvaluationId(evaluationId);
      return {
        success: true,
        skipped: true,
        reason: 'suggestion_already_exists',
        evaluation_id: evaluationId,
        suggestion_id: existing.suggestionId || existing.id
      };
    }

    // 步骤3: 查询会话上下文
    const contextData = await this._queryContextData(evaluation);
    if (!contextData) {
      return {
        success: false,
        reason: 'context_data_missing',
        evaluation_id: evaluationId
      };
    }

    // 步骤4: 组装 suggestion 输入对象
    const suggestionInput = this._buildSuggestionInput(evaluation, contextData);
    console.log('[SuggestionService] 输入对象:', JSON.stringify(suggestionInput, null, 2));

    // 步骤5: 走统一引擎调用入口生成建议答案
    let engineResult;
    try {
      engineResult = await this._callUnifiedEngine(suggestionInput);
    } catch (error) {
      console.error('[SuggestionService] 引擎调用失败:', error.message);
      return {
        success: false,
        reason: 'engine_call_failed',
        evaluation_id: evaluationId,
        error: error.message
      };
    }

    // 步骤6: 清洗返回结果
    const cleanedReply = this._cleanSuggestedReply(engineResult, suggestionInput);
    if (!cleanedReply || cleanedReply.trim() === '') {
      console.error('[SuggestionService] 清洗后回复为空');
      return {
        success: false,
        reason: 'empty_reply_after_cleaning',
        evaluation_id: evaluationId
      };
    }

    // 步骤7: 入库
    try {
      const suggestion = await this.suggestionsRepo.create({
        projectId: suggestionInput.project_id,
        sessionId: suggestionInput.session_id,
        messageId: suggestionInput.message_id,
        evaluationId: suggestionInput.evaluation_id,
        entrySource: suggestionInput.entry_source,
        agentId: suggestionInput.agent_id,
        scenario: suggestionInput.scenario,
        suggestedReply: cleanedReply
      });

      console.log('[SuggestionService] suggestion 已入库:', suggestion.suggestionId || suggestion.id);

      // 步骤8: 返回结果
      return {
        success: true,
        evaluation_id: evaluationId,
        suggestion_id: suggestion.suggestionId || suggestion.id,
        review_status: suggestion.reviewStatus,
        suggested_reply: suggestion.suggestedReply
      };
    } catch (error) {
      // 数据库唯一约束冲突
      if (error.message && error.message.includes('unique')) {
        console.log('[SuggestionService] 唯一约束冲突，suggestion 已存在:', evaluationId);
        return {
          success: true,
          skipped: true,
          reason: 'suggestion_already_exists',
          evaluation_id: evaluationId
        };
      }
      throw error;
    }
  }

  /**
   * 校验 evaluation 是否符合生成条件
   */
  async _validateEvaluation(evaluationId) {
    // 查询 evaluation
    const evaluation = await this.evaluationsRepo.findById(evaluationId);
    if (!evaluation) {
      console.log('[SuggestionService] evaluation 不存在:', evaluationId);
      return null;
    }

    // 检查是否为 unknown
    if (evaluation.problemType !== 'unknown') {
      console.log('[SuggestionService] 不是 unknown 问题，跳过生成:', {
        evaluationId,
        problemType: evaluation.problemType
      });
      return null;
    }

    // 检查必要字段
    if (!evaluation.sessionId || !evaluation.messageId) {
      console.log('[SuggestionService] evaluation 缺少必要字段:', evaluationId);
      return null;
    }

    return evaluation;
  }

  /**
   * 查询会话上下文数据
   */
  async _queryContextData(evaluation) {
    const { sessionId, messageId } = evaluation;

    // 查询 session
    const session = await this.sessionsRepo.findById(sessionId);
    if (!session) {
      console.log('[SuggestionService] session 不存在:', sessionId);
      return null;
    }

    // 查询 message
    const message = await this.messagesRepo.findById(messageId);
    if (!message) {
      console.log('[SuggestionService] message 不存在:', messageId);
      return null;
    }

    // 查询 conversation（当前 session 的所有消息）
    const messages = await this.messagesRepo.findBySessionId(sessionId);
    const conversation = messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp
    }));

    return {
      session,
      message,
      conversation
    };
  }

  /**
   * 组装 suggestion 输入对象（13个必填字段）
   */
  _buildSuggestionInput(evaluation, contextData) {
    const { session, message, conversation } = contextData;

    return {
      // 1. project_id - 项目标识
      project_id: evaluation.project || 'default',
      
      // 2. session_id - 会话标识
      session_id: evaluation.sessionId,
      
      // 3. message_id - 触发消息 ID
      message_id: evaluation.messageId,
      
      // 4. evaluation_id - 评估主键
      evaluation_id: evaluation.evaluationId,
      
      // 5. entry_source - 触发来源
      entry_source: evaluation.inputPayload?.metadata?.entry_type || 
                    evaluation.inputPayload?.metadata?.source || 
                    'live_monitor',
      
      // 6. agent_id - 客服标识
      agent_id: message.senderId || session.agentId || 'unknown',
      
      // 7. scenario - 场景名
      scenario: evaluation.scenario || '',
      
      // 8. conversation - 会话上下文
      conversation: conversation,
      
      // 9. current_reply - 当前客服回复
      current_reply: evaluation.currentReply || message.content || '',
      
      // 10. evaluation_summary - 分析摘要
      evaluation_summary: evaluation.summary || '',
      
      // 11. classify_reason - unknown 判定原因
      classify_reason: evaluation.classifyReason || '',
      
      // 12. findings - 发现的问题列表
      findings: evaluation.outputPayload?.analysis?.issues || 
                evaluation.outputPayload?.analysis?.risks || 
                [],
      
      // 13. generated_at - 生成时间
      generated_at: new Date().toISOString()
    };
  }

  /**
   * 调用统一引擎入口生成建议答案
   * 
   * 严格约束：
   * - 必须走 evaluation-service.evaluate()
   * - 禁止直连本地模型
   * - 禁止新开第二套模型调用协议
   */
  async _callUnifiedEngine(suggestionInput) {
    console.log('[SuggestionService] 调用统一引擎入口...');

    // 组装引擎输入（复用标准协议 v1.0）
    const engineInput = {
      project: suggestionInput.project_id,
      conversation: suggestionInput.conversation,
      current_reply: suggestionInput.current_reply,
      metadata: {
        source: suggestionInput.entry_source,
        session_id: suggestionInput.session_id,
        agent_id: suggestionInput.agent_id,
        timestamp: suggestionInput.generated_at,
        entry_type: 'suggestion_generation',
        evaluation_id: suggestionInput.evaluation_id,
        scenario: suggestionInput.scenario
      },
      rules: {
        // 传入 suggestion 生成的特殊规则
        mode: 'suggestion_generation',
        unknown_context: {
          evaluation_summary: suggestionInput.evaluation_summary,
          classify_reason: suggestionInput.classify_reason,
          findings: suggestionInput.findings
        }
      }
    };

    console.log('[SuggestionService] 引擎输入:', JSON.stringify(engineInput, null, 2));

    // 调用统一引擎入口
    const result = await evaluate(engineInput);

    console.log('[SuggestionService] 引擎返回:', {
      status: result.status,
      scenarioId: result.scenarioId,
      coachSummary: result.coachSummary
    });

    return result;
  }

  /**
   * 清洗 suggested_reply
   * 
   * 清洗规则：
   * 1. 始终走内容依据验证路径（无论引擎返回是教练反馈还是建议答案格式）
   * 2. 优先匹配 FAQ 标准口径
   * 3. 其次从 conversation / evaluation 提取有依据的信息组装
   * 4. 无依据时走保守回复
   * 5. 所有路径都经过内容依据校验
   * 6. 去markdown、去前缀、去多候选、去空行
   */
  _cleanSuggestedReply(engineResult, suggestionInput) {
    // 提取回复文本
    let reply = engineResult.coachSummary || 
                engineResult.suggested_reply || 
                engineResult.reply || 
                engineResult.content || 
                '';

    if (!reply) {
      return '';
    }

    console.log('[SuggestionService] 清洗前:', reply.substring(0, 100));

    // === 有 suggestionInput 时：始终走内容依据验证路径 ===
    // 不管引擎返回的是教练反馈还是建议答案格式，都必须验证内容依据
    const hasContext = suggestionInput && 
                      (suggestionInput.conversation?.length > 0 || suggestionInput.evaluation_summary);
    
    if (hasContext) {
      const rewritten = this._rewriteCoachToSuggestion(engineResult, suggestionInput);
      if (rewritten) {
        console.log('[SuggestionService] 内容依据验证通过，生成建议答案');
        console.log('[SuggestionService] 清洗后:', rewritten.substring(0, 100));
        return rewritten;
      }

      // 重写失败：走格式清洗 + 内容校验
      reply = this._formatClean(reply);

      // 对格式清洗后的结果做内容依据校验
      if (!this._verifyContentBasis(reply, suggestionInput)) {
        console.log('[SuggestionService] 格式清洗后内容无依据，降级为保守回复');
        const userMessage = this._extractUserContent(suggestionInput?.conversation || []);
        const conservativeReply = this._buildConservativeReply(userMessage, [], suggestionInput?.classify_reason || '');
        console.log('[SuggestionService] 清洗后:', conservativeReply.substring(0, 100));
        return conservativeReply;
      }

      console.log('[SuggestionService] 清洗后:', reply.substring(0, 100));
      return reply;
    }

    // === 无 suggestionInput 时：仅做格式清洗（兼容纯格式测试场景） ===
    reply = this._formatClean(reply);
    console.log('[SuggestionService] 清洗后:', reply.substring(0, 100));
    return reply;
  }

  /**
   * 将引擎结果重写为有依据的建议答案
   * 
   * 严格约束：
   * 1. 不得补写无依据的具体事实（到账时效、材料清单、处理能力等）
   * 2. 内容来源必须收敛到三类：
   *    a. 当前 conversation 已出现的信息
   *    b. evaluation 已明确输出的信息
   *    c. 已登记 FAQ / 场景知识中的明确口径（scenarios.json 的 standardReply）
   * 3. 没有足够依据时，改为保守客服回复：
   *    - 先收集信息
   *    - 先确认场景
   *    - 先说明需进一步核实
   *    - 禁止编具体时效、材料、结果
   * 
   * 优先级：FAQ匹配 > 上下文组装 > 保守回复
   */
  _rewriteCoachToSuggestion(engineResult, suggestionInput) {
    const missing = engineResult.missing || engineResult.result?.missing || [];
    const issues = engineResult.issues || engineResult.result?.issues || [];

    // 从 suggestionInput 取上下文
    const conversation = suggestionInput?.conversation || [];
    const currentReply = suggestionInput?.current_reply || '';
    const evaluationSummary = suggestionInput?.evaluation_summary || '';
    const classifyReason = suggestionInput?.classify_reason || '';
    const findings = suggestionInput?.findings || [];
    const userMessage = this._extractUserContent(conversation);

    // 提取缺失关键词（过滤无意义的虚词）
    const missingKeywords = this._filterMeaningfulKeywords(missing);

    // === 第一优先：从已登记 FAQ/场景知识中查找匹配口径 ===
    const faqResult = this._findFAQReply(userMessage);
    if (faqResult) {
      console.log('[SuggestionService] 命中FAQ口径，引用标准回复 (来源: FAQ)');
      return faqResult;
    }

    // === 第二优先：从 conversation + evaluation 中提取有依据的信息组装 ===
    const contextReply = this._tryBuildFromContext(userMessage, conversation, evaluationSummary, findings, classifyReason);
    if (contextReply) {
      console.log('[SuggestionService] 从上下文提取有依据信息组装 (来源: conversation+evaluation)');
      return contextReply;
    }

    // === 兜底：无足够依据时的保守回复 ===
    // 核心原则：不编造任何未出现的事实
    console.log('[SuggestionService] 无足够依据，走保守回复');
    return this._buildConservativeReply(userMessage, missingKeywords, classifyReason);
  }

  /**
   * 提取用户消息内容（从 conversation 中拼接所有 user/customer 轮次）
   */
  _extractUserContent(conversation) {
    return (conversation || [])
      .filter(t => t.role === 'user' || t.role === 'customer')
      .map(t => t.content || t.text || '')
      .join('');
  }

  /**
   * 从已登记 FAQ/场景知识中查找匹配的标准口径
   * 来源：scenarios.json 的 customerMessage + standardReply
   */
  _findFAQReply(userMessage) {
    if (!userMessage) return null;

    try {
      // 直接从 scenarios.json 加载已登记的 FAQ/场景知识
      // 注意：scenario-loader 的新格式不含 standardReply，必须直接读原始文件
      const fs = require('fs');
      const path = require('path');
      const scenariosPath = path.join(__dirname, '..', 'data', 'scenarios.json');
      
      if (!fs.existsSync(scenariosPath)) return null;
      const allScenarios = JSON.parse(fs.readFileSync(scenariosPath, 'utf8'));
      
      const msgLower = userMessage.toLowerCase();

      // 关键词匹配评分
      let bestMatch = null;
      let bestScore = 0;

      for (const scenario of allScenarios) {
        if (!scenario.standardReply && !scenario.standard_reply) continue;

        const customerMsg = (scenario.customerMessage || '').toLowerCase();
        const title = (scenario.title || '').toLowerCase();

        // 计算匹配分数：用户消息中的关键词在 FAQ customerMessage 中出现的比例
        const userKeywords = this._extractUserKeywords(msgLower);
        let score = 0;
        for (const kw of userKeywords) {
          if (customerMsg.includes(kw)) score += 3;
          if (title.includes(kw)) score += 1;
        }

        if (score > bestScore && score >= 4) {
          bestScore = score;
          bestMatch = scenario;
        }
      }

      if (bestMatch) {
        return bestMatch.standardReply || bestMatch.standard_reply || null;
      }
    } catch (e) {
      console.log('[SuggestionService] FAQ查找异常:', e.message);
    }

    return null;
  }

  /**
   * 从用户消息中提取关键词（简单分词）
   */
  _extractUserKeywords(message) {
    // 过滤停用词，保留有意义的词
    const stopWords = ['的', '了', '吗', '呢', '啊', '是', '在', '我', '你', '请问', '你好', '怎么', '什么', '如何', '能', '可以', '有', '要', '会', '都', '也', '还', '就', '着', '过'];
    const words = [];
    // 提取2-4字的中文词组
    const patterns = [
      /[a-zA-Z]{2,}/g, // 英文词
      /[\u4e00-\u9fa5]{2,4}/g // 中文词组
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(message)) !== null) {
        const word = match[0];
        if (!stopWords.some(sw => word === sw)) {
          words.push(word.toLowerCase());
        }
      }
    }
    return words;
  }

  /**
   * 过滤无意义的关键词（虚词、寒暄词等）
   */
  _filterMeaningfulKeywords(keywords) {
    const stopWords = ['您好', '你好', '请问', '谢谢', '感谢', '不好意思', '抱歉', '对', '是', '好', '的', '了', '吗'];
    return (keywords || []).filter(kw => !stopWords.includes(kw)).slice(0, 5);
  }

  /**
   * 无足够依据时的保守回复
   * 核心动作：收集信息、确认场景、说明需核实
   * 禁止：编具体时效、材料、结果
   */
  _buildConservativeReply(userMessage, missingKeywords, classifyReason) {
    // 使用业务关键词提取，比通用分词更精准
    const conversation = [{ role: 'user', content: userMessage }];
    const businessKeywords = this._extractBusinessKeywordsFromConversation(conversation);

    if (businessKeywords.length > 0) {
      const intentStr = businessKeywords.slice(0, 3).join('');
      return `您好，关于您提到的${intentStr}，我需要先确认一下具体情况，稍后为您回复，请问您方便稍等吗？`;
    }

    // 降级到通用关键词提取
    const userKeywords = this._extractUserKeywords(userMessage || '');
    if (userKeywords.length > 0) {
      const intentStr = userKeywords.slice(0, 3).join('');
      return `您好，关于您提到的${intentStr}，我需要先确认一下具体情况，稍后为您回复，请问您方便稍等吗？`;
    }

    if (missingKeywords.length > 0) {
      return `您好，关于您咨询的问题，我需要进一步核实，请您稍等。`;
    }

    return `您好，我需要确认一下您的问题，请稍等片刻。`;
  }

  /**
   * 从 conversation + evaluation 中提取有依据的信息组装回复
   * 
   * 只使用以下来源的信息：
   * - conversation 中用户/客服已明确说过的内容
   * - evaluation 已明确输出的 findings / summary
   * 
   * 禁止：编造 conversation 中未出现的具体事实
   */
  _tryBuildFromContext(userMessage, conversation, evaluationSummary, findings, classifyReason) {
    if (!userMessage) return null;

    // 提取用户已提及的关键业务词（只取 conversation 中实际出现的）
    const businessKeywords = this._extractBusinessKeywordsFromConversation(conversation);
    
    // 如果用户消息中没有明确的业务关键词，无法组装有依据的回复
    if (businessKeywords.length === 0) return null;

    // 提取 evaluation 中明确指出的缺失项（只引用，不编造具体内容）
    const findingHints = this._extractFindingHints(findings, evaluationSummary);

    // 组装：复述用户关注点 + 说明需核实（绝不添加具体时效/材料/结果）
    const intentStr = businessKeywords.slice(0, 3).join('');
    
    if (findingHints.length > 0) {
      // evaluation 明确指出了缺失项 → 收集信息方向
      return `您好，关于您提到的${intentStr}，我需要先${findingHints[0]}，稍后为您回复，请您稍等。`;
    }

    // evaluation 无明确缺失项 → 通用核实方向
    return `您好，关于您提到的${intentStr}，我需要进一步确认具体情况，稍后为您回复，请问您方便稍等吗？`;
  }

  /**
   * 从 conversation 中提取业务关键词（只取实际出现的有意义词汇）
   */
  _extractBusinessKeywordsFromConversation(conversation) {
    const allText = (conversation || [])
      .map(t => (t.content || t.text || '').toLowerCase())
      .join(' ');
    
    // 业务领域关键词表（只匹配 conversation 中实际出现的）
    const businessTerms = [
      // LantonPay 相关
      '转账', '收款', '扫码', 'bakkong', 'lanton', '充值', '提现', '取现',
      '退款', '手续费', '限额', '到账', '冻结', '解冻', '实名', '认证',
      '密码', '手机号', '账户', '银行', 'wing', 'aba',
      // Pai 相关
      'usdt', '数字货币', '快捷交易', '国际转账', '微信', '链', 'trc20', 'erc20', 'bep20',
      '钱包', '合约', '理财', '汇率', '买', '卖', '兑换',
      // 通用
      '注册', '下载', '登录', '验证码', '账单', '客服'
    ];
    
    return businessTerms.filter(term => allText.includes(term));
  }

  /**
   * 从 evaluation findings/summary 中提取明确的行动指引
   * 只返回 conversation 已提及或 evaluation 明确指出的缺失项
   * 禁止编造具体材料/时效/结果
   */
  _extractFindingHints(findings, evaluationSummary) {
    const hints = [];
    const allText = JSON.stringify(findings || []) + (evaluationSummary || '');
    
    // 只匹配 evaluation 明确指出的行动方向（不添加具体内容）
    if (allText.includes('身份验证') || allText.includes('身份确认')) {
      hints.push('确认您的身份信息');
    }
    if (allText.includes('信息收集') || allText.includes('收集信息') || allText.includes('缺少信息')) {
      hints.push('了解一些详细信息');
    }
    if (allText.includes('问题确认') || allText.includes('确认问题')) {
      hints.push('确认具体问题');
    }
    if (allText.includes('核实') || allText.includes('查证')) {
      hints.push('核实相关情况');
    }
    
    return hints;
  }

  /**
   * 验证回复内容的依据
   * 
   * 检查回复中是否包含无依据的具体事实：
   * - 具体时效（如 "2-6小时", "1-2个工作日", "5-8分钟"）
   * - 具体材料清单（如 "身份证、护照"）
   * - 具体处理能力（如 "支持XX", "不支持XX"）
   * 
   * 如果包含，验证这些事实是否来自三类允许来源之一：
   * 1. conversation 中已出现
   * 2. evaluation 中已明确输出
   * 3. FAQ/scenarios.json 中的明确口径
   */
  _verifyContentBasis(reply, suggestionInput) {
    if (!reply) return true; // 空回复视为通过（后续会被上层拦截）

    const conversation = suggestionInput?.conversation || [];
    const findings = suggestionInput?.findings || [];
    const evaluationSummary = suggestionInput?.evaluation_summary || '';
    const userMessage = this._extractUserContent(conversation);

    // 汇总所有允许来源的文本
    const allowedText = [
      userMessage,
      ...conversation.map(t => t.content || t.text || ''),
      JSON.stringify(findings),
      evaluationSummary
    ].join(' ').toLowerCase();

    // 检查 FAQ 匹配（如果回复和某个 FAQ standardReply 相同，视为有依据）
    const faqReply = this._findFAQReply(userMessage);
    if (faqReply && reply.trim() === faqReply.trim()) {
      return true; // 完全来自 FAQ 口径
    }

    // 检测回复中的具体时效表述
    const timePatterns = [
      /\d+[-~到]\d+\s*(个|天|小时|分钟|工作日)/g,
      /\d+\s*(小时|分钟|天|工作日)内?/g
    ];
    for (const pattern of timePatterns) {
      let match;
      while ((match = pattern.exec(reply)) !== null) {
        // 检查该时效是否在允许来源中出现过
        if (!allowedText.includes(match[0])) {
          console.log(`[SuggestionService] 发现无依据时效: ${match[0]}`);
          return false;
        }
      }
    }

    // 检测回复中的具体材料清单
    const materialPatterns = [
      /(身份证|护照|银行卡|手机号|证件照|手持证件|视频)[，、及与].*(身份证|护照|银行卡|手机号|证件照|手持证件|视频)/g
    ];
    for (const pattern of materialPatterns) {
      let match;
      while ((match = pattern.exec(reply)) !== null) {
        // 材料清单至少包含2个材料项才算是"编造材料清单"
        if (!allowedText.includes(match[1]) && !allowedText.includes(match[2])) {
          console.log(`[SuggestionService] 发现无依据材料清单: ${match[0]}`);
          return false;
        }
      }
    }

    // 检测回复中是否明确断言了处理能力（且不在允许来源中）
    const capabilityPatterns = [
      /不支持(数字货币|USDT|充值|提现|转账|退款)/g,
      /仅支持(法定货币|银行转账|扫码)/g
    ];
    for (const pattern of capabilityPatterns) {
      let match;
      while ((match = pattern.exec(reply)) !== null) {
        const fragment = match[0].replace(/不支持|仅支持/, '');
        if (!allowedText.includes(fragment) && !allowedText.includes(match[0])) {
          console.log(`[SuggestionService] 发现无依据处理能力断言: ${match[0]}`);
          return false;
        }
      }
    }

    return true; // 通过验证
  }

  /**
   * 格式清洗（纯格式层面）
   */
  _formatClean(reply) {

    // 1. 去 markdown 标记
    reply = reply.replace(/#{1,6}\s+/g, ''); // 去标题标记
    reply = reply.replace(/\*\*(.+?)\*\*/g, '$1'); // 去粗体
    reply = reply.replace(/\*(.+?)\*/g, '$1'); // 去斜体
    reply = reply.replace(/`{1,3}(.+?)`{1,3}/g, '$1'); // 去代码块
    reply = reply.replace(/\[(.+?)\]\(.+?\)/g, '$1'); // 去链接

    // 2. 去"建议回复如下"等前缀
    // （注意：必须在去诊断符号之后执行）
    const prefixPatterns = [
      /^建议回复如下[\s：:]*/i,
      /^建议回复[：:\s]+/i,
      /^建议答案如下[\s：:]*/i,
      /^建议答案[：:\s]+/i,
      /^候选回复如下[\s：:]*/i,
      /^候选回复[：:\s]+/i,
      /^回复建议[：:\s]+/i,
      /^以下是建议[\s：:]*/i,
      /^建议如下[\s：:]*/i,
      /^回复如下[\s：:]*/i,
      /^答案如下[\s：:]*/i,
    ];
    for (const pattern of prefixPatterns) {
      reply = reply.replace(pattern, '');
    }

    // 3. 去"仅供参考"等废话前缀
    const uselessPrefixes = [
      /^仅供参考[，,。！!\s]*/i,
      /^这只是建议[，,。！!\s]*/i,
      /^请注意[，,。！!\s]*/i,
      /^提示[：:]\s*/i,
    ];
    for (const prefix of uselessPrefixes) {
      reply = reply.replace(prefix, '');
    }

    // 4. 去多候选格式（提取第一条）
    const multiCandidatePattern = /^(\d+|[A-Z])[.、]\s*(.+?)(?=\n(\d+|[A-Z])[.、\s]|$)/s;
    const match = reply.match(multiCandidatePattern);
    if (match) {
      reply = match[2].trim();
      console.log('[SuggestionService] 检测到多候选格式，提取第一条');
    }

    // 5. 去多余空行
    reply = reply.replace(/\n{2,}/g, '\n');

    // 6. 去前后空白
    reply = reply.trim();

    return reply;
  }

  /**
   * 查询指定 evaluation 的 suggestion
   */
  async getSuggestionByEvaluation(evaluationId) {
    return await this.suggestionsRepo.findByEvaluationId(evaluationId);
  }

  /**
   * 查询所有待审核的 suggestion
   */
  async getPendingSuggestions() {
    return await this.suggestionsRepo.findPendingSuggestions();
  }
}

// 导出类和单例
const defaultService = new UnknownSuggestionService();

module.exports = {
  UnknownSuggestionService,
  defaultService
};
