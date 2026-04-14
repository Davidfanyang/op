/**
 * API 响应工具类
 * 
 * 统一响应格式，支持：
 * - 成功响应
 * - 错误响应
 * - 分页响应
 */

/**
 * 错误码定义
 */
const ErrorCodes = {
  // 通用错误码
  OK: 'OK',
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  
  // review 相关
  REVIEW_NOT_FOUND: 'REVIEW_NOT_FOUND',
  REVIEW_ALREADY_PROCESSED: 'REVIEW_ALREADY_PROCESSED',
  INVALID_REVIEW_DECISION: 'INVALID_REVIEW_DECISION',
  INVALID_REVIEW_STATUS: 'INVALID_REVIEW_STATUS',
  
  // evaluation 相关
  EVALUATION_NOT_FOUND: 'EVALUATION_NOT_FOUND',
  EVALUATION_SYNC_FAILED: 'EVALUATION_SYNC_FAILED',
  
  // project 相关
  PROJECT_ID_REQUIRED: 'PROJECT_ID_REQUIRED',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND'
};

/**
 * 错误消息映射
 */
const ErrorMessages = {
  [ErrorCodes.OK]: 'ok',
  [ErrorCodes.BAD_REQUEST]: 'bad request',
  [ErrorCodes.VALIDATION_ERROR]: 'validation error',
  [ErrorCodes.INTERNAL_ERROR]: 'internal server error',
  [ErrorCodes.REVIEW_NOT_FOUND]: 'review record not found',
  [ErrorCodes.REVIEW_ALREADY_PROCESSED]: 'review already processed',
  [ErrorCodes.INVALID_REVIEW_DECISION]: 'reviewDecision must be approved, rejected, or needs_edit',
  [ErrorCodes.INVALID_REVIEW_STATUS]: 'invalid review status',
  [ErrorCodes.EVALUATION_NOT_FOUND]: 'evaluation record not found',
  [ErrorCodes.EVALUATION_SYNC_FAILED]: 'failed to sync evaluation',
  [ErrorCodes.PROJECT_ID_REQUIRED]: 'projectId is required',
  [ErrorCodes.PROJECT_NOT_FOUND]: 'project not found'
};

/**
 * 生成请求ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * 创建成功响应
 * @param {Object} data - 响应数据
 * @param {string} message - 响应消息
 * @param {string} requestId - 请求ID（可选）
 * @returns {Object}
 */
function success(data, message = 'ok', requestId = null) {
  return {
    success: true,
    code: ErrorCodes.OK,
    message,
    data,
    meta: {
      requestId: requestId || generateRequestId(),
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * 创建错误响应
 * @param {string} code - 错误码
 * @param {string} message - 错误消息（可选，默认使用预定义消息）
 * @param {string} requestId - 请求ID（可选）
 * @returns {Object}
 */
function error(code, message = null, requestId = null) {
  return {
    success: false,
    code,
    message: message || ErrorMessages[code] || 'unknown error',
    data: null,
    meta: {
      requestId: requestId || generateRequestId(),
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * 创建分页响应
 * @param {Array} items - 数据项
 * @param {Object} pagination - 分页信息
 * @param {string} requestId - 请求ID（可选）
 * @returns {Object}
 */
function paginated(items, pagination, requestId = null) {
  return success({
    items,
    pagination: {
      limit: pagination.limit || 20,
      offset: pagination.offset || 0,
      hasMore: (pagination.offset || 0) + items.length < (pagination.total || 0),
      total: pagination.total || 0
    }
  }, 'ok', requestId);
}

/**
 * API 错误类
 */
class APIError extends Error {
  constructor(code, message = null) {
    super(message || ErrorMessages[code] || code);
    this.code = code;
    this.name = 'APIError';
  }
  
  toResponse(requestId = null) {
    return error(this.code, this.message, requestId);
  }
}

/**
 * 常用错误工厂
 */
const Errors = {
  badRequest: (message) => new APIError(ErrorCodes.BAD_REQUEST, message),
  validationError: (message) => new APIError(ErrorCodes.VALIDATION_ERROR, message),
  internalError: (message) => new APIError(ErrorCodes.INTERNAL_ERROR, message),
  reviewNotFound: () => new APIError(ErrorCodes.REVIEW_NOT_FOUND),
  reviewAlreadyProcessed: () => new APIError(ErrorCodes.REVIEW_ALREADY_PROCESSED),
  invalidReviewDecision: () => new APIError(ErrorCodes.INVALID_REVIEW_DECISION),
  invalidReviewStatus: (status) => new APIError(ErrorCodes.INVALID_REVIEW_STATUS, `invalid review status: ${status}`),
  evaluationNotFound: () => new APIError(ErrorCodes.EVALUATION_NOT_FOUND),
  evaluationSyncFailed: () => new APIError(ErrorCodes.EVALUATION_SYNC_FAILED),
  projectIdRequired: () => new APIError(ErrorCodes.PROJECT_ID_REQUIRED),
  projectNotFound: () => new APIError(ErrorCodes.PROJECT_NOT_FOUND)
};

module.exports = {
  ErrorCodes,
  ErrorMessages,
  generateRequestId,
  success,
  error,
  paginated,
  APIError,
  Errors
};
