/**
 * Telegram 告警通知
 * 当 live_monitor 检测到低分或违规时，发送告警到指定群组
 * 
 * 告警发送规则（新）：
 * - critical: 发送 Telegram 告警
 * - warning: 灰度模式发测试群，否则只记录
 * - observation: 只记录，不发送
 * - evaluationStatus 为错误状态时，不发送任何告警
 */

const { createTelegramClient } = require('../telegram/telegram-client');
const { AlertLevel, EvaluationStatus } = require('../../core/constants/statuses');

class TelegramAlerter {
  constructor(options = {}) {
    this.token = options.token || process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = options.chatId || process.env.TELEGRAM_ALERT_CHAT_ID;
    this.testChatId = options.testChatId || process.env.GRAY_TEST_CHAT_ID;
    this.client = null;
    this.isGrayMode = process.env.GRAY_RELEASE_ENABLED === 'true';
    
    if (this.token) {
      this.client = createTelegramClient({ token: this.token });
    }
  }

  /**
   * 发送告警
   * 按 alertLevel 和 evaluationStatus 决定发送策略
   */
  async sendAlert(result) {
    if (!this.client || !this.chatId) {
      console.warn('[TelegramAlerter] 未配置 token 或 chatId');
      return;
    }

    const alertLevel = result.alertLevel || AlertLevel.NONE;
    const evaluationStatus = result.evaluationStatus;

    // 1. 检查 evaluationStatus，错误状态不发送告警
    const errorStatuses = [
      EvaluationStatus.INVALID_INPUT,
      EvaluationStatus.SCENARIO_NOT_FOUND,
      EvaluationStatus.SCENARIO_MATCH_LOW_CONFIDENCE,
      EvaluationStatus.SCORING_UNAVAILABLE,
      EvaluationStatus.EVALUATION_FAILED
    ];
    
    if (errorStatuses.includes(evaluationStatus)) {
      console.log(`[TelegramAlerter] 跳过错误状态告警 (${evaluationStatus})`);
      return;
    }

    // 2. 根据 alertLevel 决定发送策略
    switch (alertLevel) {
      case AlertLevel.CRITICAL:
        // critical: 发送 Telegram 告警
        await this._sendToChat(this.chatId, result);
        break;
        
      case AlertLevel.WARNING:
        // warning: 灰度模式发测试群，否则只记录
        if (this.isGrayMode && this.testChatId) {
          await this._sendToChat(this.testChatId, result);
        } else {
          console.log(`[TelegramAlerter] warning 级别只记录，不发送 (灰度模式: ${this.isGrayMode})`);
        }
        break;
        
      case AlertLevel.OBSERVATION:
        // observation: 只记录，不发送
        console.log('[TelegramAlerter] observation 级别只记录，不发送');
        break;
        
      case AlertLevel.NONE:
      default:
        // none: 不发送
        console.log('[TelegramAlerter] 无告警，不发送');
        break;
    }
  }

  /**
   * 内部方法：发送到指定 chat
   */
  async _sendToChat(chatId, result) {
    const message = this.formatAlertMessage(result);
    
    try {
      // 先尝试 Markdown 格式
      await this.client.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      console.log(`[TelegramAlerter] 告警已发送到 ${chatId}`);
    } catch (err) {
      console.warn('[TelegramAlerter] Markdown 格式发送失败，尝试纯文本:', err.message);
      try {
        // 降级为纯文本
        await this.client.sendMessage(chatId, message, { parse_mode: undefined });
        console.log(`[TelegramAlerter] 告警已发送到 ${chatId} (纯文本)`);
      } catch (err2) {
        console.error('[TelegramAlerter] 发送失败:', err2.message);
      }
    }
  }

  /**
   * 格式化告警消息
   * 新增：显示 evaluationStatus 和 reviewStatus
   */
  formatAlertMessage(result) {
    const alerts = result.alerts || [];
    const criticalAlerts = alerts.filter(a => a.level === AlertLevel.CRITICAL);
    const warningAlerts = alerts.filter(a => a.level === AlertLevel.WARNING);
    
    let message = '';
    
    // 灰度标记
    if (result.grayRelease?.isGrayMode) {
      message += '⚠️ *[灰度测试]*\n';
      message += `_免责声明: ${result.grayRelease.disclaimer}_\n\n`;
    }
    
    // 根据 alertLevel 显示不同标题
    const levelEmoji = {
      [AlertLevel.CRITICAL]: '🚨',
      [AlertLevel.WARNING]: '⚠️',
      [AlertLevel.OBSERVATION]: '👁'
    };
    const emoji = levelEmoji[result.alertLevel] || '📋';
    message += `${emoji} *客服质量告警 - ${result.alertLevel?.toUpperCase()}*\n\n`;
    
    // 新增：三层状态显示
    message += '*状态信息*\n';
    message += `评估状态: ${result.evaluationStatus || 'unknown'}\n`;
    message += `复核状态: ${result.reviewStatus || 'pending'}\n\n`;
    
    // 基础信息
    message += `*项目:* ${result.projectId || 'unknown'}\n`;
    message += `*场景:* ${result.matchedScenario?.title || result.scenarioId || 'unknown'}\n`;
    message += `*等级:* ${result.result?.level || 'unknown'}\n`;
    message += `*告警级别:* ${result.alertLevel}\n\n`;
    
    // 严重告警
    if (criticalAlerts.length > 0) {
      message += '🔴 *严重问题*\n';
      criticalAlerts.forEach(alert => {
        message += `• ${alert.message}\n`;
      });
      message += '\n';
    }
    
    // 警告级告警
    if (warningAlerts.length > 0) {
      message += '🟡 *警告问题*\n';
      warningAlerts.forEach(alert => {
        message += `• ${alert.message}\n`;
      });
      message += '\n';
    }
    
    // 问题列表
    if (result.result?.issues && result.result.issues.length > 0) {
      message += '🔍 *问题清单*\n';
      result.result.issues.slice(0, 5).forEach(issue => {
        message += `• ${issue.message || issue}\n`;
      });
      message += '\n';
    }
    
    // 会话ID
    if (result.sessionId) {
      message += `*会话ID:* \`${result.sessionId}\`\n\n`;
    }
    
    // 复核命令提示
    message += '*复核命令*\n';
    message += '`/review confirmed [备注]` - 确认告警\n';
    message += '`/review false_positive [原因] [备注]` - 标记误报\n';
    message += '`/review dismissed [备注]` - 忽略\n\n';
    message += '*误报原因可选:*\n';
    message += '`thresholdtoosensitive` `dimensionmappingstrict` `modelunderstandinglimitation` `scenariomatcherror` `other`\n\n';
    
    // 时间戳
    message += `_告警时间: ${new Date().toLocaleString('zh-CN')}_`;
    
    return message;
  }

  /**
   * 发送复核确认消息
   */
  async sendReviewConfirmation(chatId, result) {
    if (!this.client || !chatId) return;

    const { reviewStatus, falsePositiveReason, reviewComment, reviewedBy, sessionId } = result;
    
    let message = '';
    
    switch (reviewStatus) {
      case 'confirmed':
        message += '✅ *复核已更新*\n\n';
        break;
      case 'false_positive':
        message += '🔄 *复核已更新*\n\n';
        break;
      case 'dismissed':
        message += '🚫 *复核已更新*\n\n';
        break;
      default:
        message += '📋 *复核已更新*\n\n';
    }
    
    message += `*会话ID:* \`${sessionId}\`\n`;
    message += `*复核状态:* ${reviewStatus}\n`;
    
    if (reviewedBy) {
      message += `*复核人:* ${reviewedBy}\n`;
    }
    
    if (falsePositiveReason) {
      message += `*误报原因:* ${falsePositiveReason}\n`;
    }
    
    if (reviewComment) {
      message += `*备注:* ${reviewComment}\n`;
    }
    
    try {
      await this.client.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[TelegramAlerter] 发送复核确认失败:', err.message);
    }
  }
}

module.exports = { TelegramAlerter };
