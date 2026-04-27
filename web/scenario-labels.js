/**
 * Scenario Labels - 场景中文映射
 * 
 * 用于 Web 页面展示层，将技术值映射为中文名称。
 * 不修改数据库原始值，不修改后端逻辑。
 */

const SCENARIO_LABELS = {
  // 真实业务场景
  same_scenario: '同类问题场景',
  account_locked: '账户锁定处理',
  transfer_not_received: '转账成功未到账',
  general_unknown: '未知问题咨询',
  final_verification: '最终验收验证',
  knowledge_api_test: '知识库接口验证',
  test: '测试场景',
  
  // 银行客服场景（根据项目实际情况扩展）
  lanton_transfer_success_not_received: '兰顿转账成功未到账',
  card_lost_report: '银行卡挂失',
  password_reset: '密码重置',
  account_balance_inquiry: '账户余额查询',
  transaction_limit_adjustment: '交易限额调整',
  loan_application: '贷款申请',
  credit_card_activation: '信用卡激活',
  mobile_banking_setup: '手机银行开通',
  
  // 未知/默认场景
  unknown: '未知场景',
  default: '默认场景'
};

/**
 * 获取场景中文标签
 * @param {string} value - 场景原始值
 * @returns {string} 场景中文名称，如果不存在则返回原始值
 */
function getScenarioLabel(value) {
  if (!value) return '-';
  return SCENARIO_LABELS[value] || value;
}

/**
 * 获取场景完整标题（中文 + 原始值）
 * @param {string} value - 场景原始值
 * @returns {string} 格式："中文名称（原始值）" 或 "原始值"
 */
function getScenarioTitle(value) {
  if (!value) return '-';
  const label = getScenarioLabel(value);
  return label === value ? value : `${label}（${value}）`;
}

/**
 * 生成场景下拉选项 HTML
 * @param {Object} options - 配置项
 * @param {string} options.name - select name
 * @param {string} options.id - select id
 * @param {string} options.value - 当前选中值
 * @param {boolean} options.showAll - 是否显示"全部"选项
 * @param {string} options.allLabel - "全部"选项的文本
 * @returns {string} select HTML
 */
function renderScenarioSelect(options = {}) {
  const {
    name = 'scenario',
    id = 'scenario',
    value = '',
    showAll = true,
    allLabel = '全部场景'
  } = options;

  let html = `<select name="${name}" id="${id}">`;
  
  if (showAll) {
    html += `<option value="">${allLabel}</option>`;
  }

  Object.keys(SCENARIO_LABELS).forEach(key => {
    const selected = key === value ? 'selected' : '';
    html += `<option value="${key}" ${selected}>${SCENARIO_LABELS[key]}</option>`;
  });

  html += '</select>';
  return html;
}

/**
 * 获取所有场景标签映射表
 * @returns {Object} 场景映射表
 */
function getScenarioLabelsMap() {
  return { ...SCENARIO_LABELS };
}

// 导出到全局
window.ScenarioLabels = {
  SCENARIO_LABELS,
  getScenarioLabel,
  getScenarioTitle,
  renderScenarioSelect,
  getScenarioLabelsMap
};
