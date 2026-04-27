function parseCommand(text) {
  const normalized = text.toLowerCase().trim();
  
  // 直接命令匹配
  if (['/start', 'start', '开始', '重新开始'].includes(normalized)) return 'start';
  if (['/next', 'next', '下一题', '继续'].includes(normalized)) return 'next';
  if (['/cancel', 'cancel', '取消', '停止', '退出'].includes(normalized)) return 'cancel';
  
  // 训练命令匹配
  if (normalized.startsWith('/train') || normalized.startsWith('train')) return 'train';
  if (['/status', 'status', '状态', '训练状态'].includes(normalized)) return 'status';
  if (['/stop', 'stop', '停止训练', '结束训练'].includes(normalized)) return 'stop';
  
  // review 命令匹配
  if (normalized.startsWith('/review')) return 'review';
  
  // 帮助命令
  if (['/help', 'help', '帮助'].includes(normalized)) return 'help';
  
  // 训练统计命令
  if (['/training_pending', 'training_pending'].includes(normalized)) return 'training_pending';
  if (['/training_stats', 'training_stats', '训练统计'].includes(normalized)) return 'training_stats';
  
  return null;
}

/**
 * 解析 review 命令
 * @param {string} text - 完整命令文本
 * @returns {Object|null} 解析结果
 * 
 * 支持格式：
 * /review confirmed [备注]
 * /review false_positive [原因] [备注]
 * /review dismissed [备注]
 */
function parseReviewCommand(text) {
  const normalized = text.trim().toLowerCase();
  
  const match = normalized.match(/^\/review\s+(confirmed|false_positive|dismissed)(?:\s+(.+))?$/);
  if (!match) {
    return null;
  }

  const status = match[1];
  const rest = match[2] || '';

  const result = {
    reviewStatus: status,
    falsePositiveReason: null,
    reviewComment: ''
  };

  if (status === 'false_positive') {
    // 尝试解析误报原因
    const reasonMatch = rest.match(/^(threshold_too_sensitive|dimension_mapping_strict|model_understanding_limitation|scenario_match_error|other)(?:\s+(.+))?$/);
    if (reasonMatch) {
      result.falsePositiveReason = reasonMatch[1];
      result.reviewComment = reasonMatch[2] || '';
    } else {
      // 没有提供原因，整个作为备注（这种情况应该报错）
      result.reviewComment = rest;
      result._missingReason = true; // 标记缺少原因
    }
  } else {
    // confirmed 或 dismissed，剩余部分都是备注
    result.reviewComment = rest;
  }

  return result;
}

// 检查文本是否包含命令意图
function isCommandLike(text, intent) {
  const normalized = String(text || '').trim().toLowerCase();
  
  switch (intent) {
    case '帮助':
      return normalized.includes('帮助') || 
             normalized.includes('怎么用') || 
             normalized.includes('使用说明') || 
             normalized.includes('怎么操作') ||
             normalized === '?';
    
    case 'help':
      return normalized.includes('help') || 
             normalized === '?';
    
    // 可以添加更多自然语言命令意图
    default:
      return false;
  }
}

module.exports = { parseCommand, parseReviewCommand, isCommandLike };