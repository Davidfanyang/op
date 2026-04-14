/**
 * 状态枚举定义
 * 
 * 三层状态体系：
 * 1. evaluationStatus - 评估状态
 * 2. alertLevel - 告警等级
 * 3. reviewStatus - 复核状态
 */

// 评估状态
const EvaluationStatus = {
  OK: 'ok',
  INVALID_INPUT: 'invalid_input',
  SCENARIO_NOT_FOUND: 'scenario_not_found',
  SCENARIO_MATCH_LOW_CONFIDENCE: 'scenario_match_low_confidence',
  SCORING_UNAVAILABLE: 'scoring_unavailable',
  EVALUATION_FAILED: 'evaluation_failed',
  ALERT_TRIGGERED: 'alert_triggered'
};

// 告警等级
const AlertLevel = {
  NONE: 'none',
  OBSERVATION: 'observation',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

// 复核状态
const ReviewStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  FALSE_POSITIVE: 'false_positive',
  DISMISSED: 'dismissed'
};

// 误报原因
const FalsePositiveReason = {
  THRESHOLD_TOO_SENSITIVE: 'threshold_too_sensitive',
  DIMENSION_MAPPING_STRICT: 'dimension_mapping_strict',
  MODEL_UNDERSTANDING_LIMITATION: 'model_understanding_limitation',
  SCENARIO_MATCH_ERROR: 'scenario_match_error',
  OTHER: 'other'
};

// 状态流转规则
const StatusFlow = {
  // 正常无告警
  OK: {
    evaluationStatus: EvaluationStatus.OK,
    alertLevel: AlertLevel.NONE,
    reviewStatus: ReviewStatus.PENDING
  },
  // 触发告警
  ALERT: {
    evaluationStatus: EvaluationStatus.ALERT_TRIGGERED,
    alertLevel: null, // 由具体告警等级决定
    reviewStatus: ReviewStatus.PENDING
  },
  // 场景低置信度
  LOW_CONFIDENCE: {
    evaluationStatus: EvaluationStatus.SCENARIO_MATCH_LOW_CONFIDENCE,
    alertLevel: AlertLevel.NONE,
    reviewStatus: ReviewStatus.PENDING
  },
  // 输入错误
  INVALID: {
    evaluationStatus: EvaluationStatus.INVALID_INPUT,
    alertLevel: AlertLevel.NONE,
    reviewStatus: ReviewStatus.PENDING
  },
  // 评分服务不可用
  SCORING_ERROR: {
    evaluationStatus: EvaluationStatus.SCORING_UNAVAILABLE,
    alertLevel: AlertLevel.NONE,
    reviewStatus: ReviewStatus.PENDING
  },
  // 评估内部异常
  EVAL_ERROR: {
    evaluationStatus: EvaluationStatus.EVALUATION_FAILED,
    alertLevel: AlertLevel.NONE,
    reviewStatus: ReviewStatus.PENDING
  }
};

// 复核状态校验规则
const ReviewValidationRules = {
  [ReviewStatus.CONFIRMED]: {
    requireFalsePositiveReason: false,
    allowComment: true
  },
  [ReviewStatus.FALSE_POSITIVE]: {
    requireFalsePositiveReason: true,
    allowComment: true
  },
  [ReviewStatus.DISMISSED]: {
    requireFalsePositiveReason: false,
    allowComment: true
  }
};

module.exports = {
  EvaluationStatus,
  AlertLevel,
  ReviewStatus,
  FalsePositiveReason,
  StatusFlow,
  ReviewValidationRules
};
