/**
 * 告警服务（初版）
 * 
 * 职责：
 * 1. 接收实时质检结果
 * 2. 根据固定规则判定是否触发告警
 * 3. 生成告警对象
 * 4. 不负责发通知
 * 5. 不负责审核
 * 6. 不负责知识库沉淀
 * 
 * 告警判定规则：
 * - high：analysis.risks 明确高风险，或 judgement / summary 明确严重问题
 * - medium：unknown 且 need_review=true，或存在中等风险提示
 * - none：普通问题不触发告警
 * 
 * 判定优先级：
 * 第一步：先检查 analysis.risks
 * 第二步：再检查 judgement
 * 第三步：再检查 summary
 * 第四步：最后检查 problem_type + need_review
 */

class AlertService {
  /**
   * 判定告警等级
   * 
   * @param {Object} evaluation - 实时质检评估记录
   * @returns {Object} 告警结果 { alert_level, alert_type, alert_reason, need_attention }
   */
  evaluateAlert(evaluation) {
    const {
      analysis,
      judgement,
      summary,
      problem_type,
      need_review,
      confidence
    } = this._extractFields(evaluation);

    // 按照固定优先级进行判定

    // 第一步：检查 analysis.risks
    const highRiskFromAnalysis = this._checkHighRiskFromAnalysis(analysis);
    if (highRiskFromAnalysis) {
      return {
        alert_level: 'high',
        alert_type: 'risk',
        alert_reason: highRiskFromAnalysis,
        need_attention: true
      };
    }

    // 第二步：检查 judgement
    const highRiskFromJudgement = this._checkHighRiskFromJudgement(judgement);
    if (highRiskFromJudgement) {
      return {
        alert_level: 'high',
        alert_type: 'risk',
        alert_reason: highRiskFromJudgement,
        need_attention: true
      };
    }

    // 第三步：检查 summary
    const highRiskFromSummary = this._checkHighRiskFromSummary(summary);
    if (highRiskFromSummary) {
      return {
        alert_level: 'high',
        alert_type: 'risk',
        alert_reason: highRiskFromSummary,
        need_attention: true
      };
    }

    // 第四步：检查 problem_type + need_review（medium 级别）
    const mediumRiskFromUnknown = this._checkMediumRiskFromUnknown(problem_type, need_review);
    if (mediumRiskFromUnknown) {
      return {
        alert_level: 'medium',
        alert_type: 'unknown',
        alert_reason: mediumRiskFromUnknown,
        need_attention: true
      };
    }

    // 检查 analysis.risks 中等风险
    const mediumRiskFromAnalysis = this._checkMediumRiskFromAnalysis(analysis);
    if (mediumRiskFromAnalysis) {
      return {
        alert_level: 'medium',
        alert_type: 'risk',
        alert_reason: mediumRiskFromAnalysis,
        need_attention: true
      };
    }

    // 检查低置信度 + 明显问题
    const mediumRiskFromLowConfidence = this._checkMediumRiskFromLowConfidence(confidence, judgement, summary);
    if (mediumRiskFromLowConfidence) {
      return {
        alert_level: 'medium',
        alert_type: 'quality',
        alert_reason: mediumRiskFromLowConfidence,
        need_attention: true
      };
    }

    // 不触发告警
    return {
      alert_level: 'none',
      alert_type: '',
      alert_reason: '',
      need_attention: false
    };
  }

  /**
   * 从 evaluation 中提取关键字段
   */
  _extractFields(evaluation) {
    return {
      analysis: evaluation.outputPayload?.analysis || evaluation.analysis || {},
      judgement: evaluation.judgement || evaluation.outputPayload?.result?.judgement || '',
      summary: evaluation.summary || evaluation.outputPayload?.coachSummary || '',
      problem_type: evaluation.problemType || evaluation.problem_type || 'known',
      need_review: evaluation.needReview !== undefined ? evaluation.needReview : evaluation.need_review || false,
      confidence: evaluation.confidence || evaluation.outputPayload?.result?.confidence || 0.5
    };
  }

  /**
   * 检查 analysis.risks 中的高风险
   */
  _checkHighRiskFromAnalysis(analysis) {
    if (!analysis || !analysis.risks || !Array.isArray(analysis.risks) || analysis.risks.length === 0) {
      return null;
    }

    const highRiskKeywords = [
      '高风险',
      '误导用户',
      '存在严重问题',
      '可能造成资金风险',
      '可能导致错误操作',
      '严重误导',
      '风险很高',
      '不可接受',
      '重大后果',
      '资金损失',
      '严重服务风险'
    ];

    for (const risk of analysis.risks) {
      const riskText = typeof risk === 'string' ? risk : (risk.description || risk.message || '');
      for (const keyword of highRiskKeywords) {
        if (riskText.includes(keyword)) {
          return `analysis.risks 包含高风险提示: ${riskText}`;
        }
      }
    }

    return null;
  }

  /**
   * 检查 judgement 中的高风险
   */
  _checkHighRiskFromJudgement(judgement) {
    if (!judgement || typeof judgement !== 'string') {
      return null;
    }

    const highRiskKeywords = [
      '严重错误',
      '明显误导',
      '风险很高',
      '不可接受',
      '高风险',
      '严重误导',
      '重大风险'
    ];

    for (const keyword of highRiskKeywords) {
      if (judgement.includes(keyword)) {
        return `judgement 明确指向严重错误: ${judgement}`;
      }
    }

    return null;
  }

  /**
   * 检查 summary 中的高风险
   */
  _checkHighRiskFromSummary(summary) {
    if (!summary || typeof summary !== 'string') {
      return null;
    }

    const highRiskKeywords = [
      '可能导致用户误操作',
      '可能造成资金损失',
      '会导致严重服务风险',
      '严重风险',
      '重大后果',
      '不可接受'
    ];

    for (const keyword of highRiskKeywords) {
      if (summary.includes(keyword)) {
        return `summary 明确说明当前回复会带来重大后果: ${summary}`;
      }
    }

    return null;
  }

  /**
   * 检查 unknown + need_review（medium 级别）
   */
  _checkMediumRiskFromUnknown(problem_type, need_review) {
    if (problem_type === 'unknown' && need_review === true) {
      return `problem_type=unknown 且 need_review=true，需要进入审核`;
    }
    return null;
  }

  /**
   * 检查 analysis.risks 中等风险
   */
  _checkMediumRiskFromAnalysis(analysis) {
    if (!analysis || !analysis.risks || !Array.isArray(analysis.risks) || analysis.risks.length === 0) {
      return null;
    }

    // 如果存在 risks 但未达到 high 级别，则为 medium
    const riskTexts = analysis.risks.map(risk => 
      typeof risk === 'string' ? risk : (risk.description || risk.message || '')
    ).filter(text => text.length > 0);

    if (riskTexts.length > 0) {
      return `analysis.risks 存在风险提示，但未达到 high 程度: ${riskTexts.join('; ')}`;
    }

    return null;
  }

  /**
   * 检查低置信度 + 明显问题（medium 级别）
   */
  _checkMediumRiskFromLowConfidence(confidence, judgement, summary) {
    if (confidence < 0.7) {
      // 检查 judgement 或 summary 是否显示问题明显
      const hasIssue = (judgement && judgement.length > 0) || (summary && summary.length > 0);
      if (hasIssue) {
        return `confidence=${confidence} < 0.7 且分析结果指出问题明显`;
      }
    }
    return null;
  }
}

// 导出单例
const defaultAlertService = new AlertService();

module.exports = {
  AlertService,
  defaultAlertService
};
