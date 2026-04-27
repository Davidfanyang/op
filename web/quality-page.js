/**
 * Quality Page - 质检记录查询页面逻辑
 */

let currentSessions = [];
let currentDetail = null;
let currentPage = 1;
const pageSize = 20;

/**
 * 页面初始化
 */
window.onload = async () => {
    await loadStats();
    await loadSessions();
};

/**
 * 加载统计数据
 */
async function loadStats() {
    try {
        const stats = await APIClient.getStatsQuality();
        
        document.getElementById('stat-sessions').textContent = stats.total_sessions || 0;
        document.getElementById('stat-messages').textContent = stats.total_messages || 0;
        document.getElementById('stat-evaluations').textContent = stats.total_evaluations || 0;
        document.getElementById('stat-unknown').textContent = stats.unknown_count || 0;
        document.getElementById('stat-alerts').textContent = stats.total_evaluations ? (stats.total_evaluations - (stats.known_count || 0)) : 0;
    } catch (error) {
        console.error('加载统计数据失败:', error);
        showMessage('error', `加载统计数据失败: ${error.message}`);
    }
}

/**
 * 加载会话列表
 */
async function loadSessions(page = 1) {
    currentPage = page;
    const tbody = document.getElementById('sessions-table-body');
    tbody.innerHTML = '<tr><td colspan="12" class="loading">加载中...</td></tr>';

    try {
        // 获取筛选条件
        const params = {
            page: currentPage,
            page_size: pageSize,
            project: document.getElementById('filter-project').value || undefined,
            agent_id: document.getElementById('filter-agent-id').value || undefined,
            scenario: document.getElementById('filter-scenario').value || undefined,
            problem_type: document.getElementById('filter-problem-type').value || undefined,
            has_alert: document.getElementById('filter-has-alert').value || undefined,
            alert_level: document.getElementById('filter-alert-level').value || undefined,
            start_time: document.getElementById('filter-start-time').value || undefined,
            end_time: document.getElementById('filter-end-time').value || undefined
        };

        const data = await APIClient.getQualitySessions(params);
        currentSessions = data.list || [];

        if (currentSessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="empty">暂无数据</td></tr>';
            document.getElementById('pagination').innerHTML = '';
            return;
        }

        // 渲染表格
        tbody.innerHTML = currentSessions.map(session => `
            <tr>
                <td><code>${escapeHtml(session.session_id || '')}</code></td>
                <td>${escapeHtml(session.project || '-')}</td>
                <td>${escapeHtml(session.agent_id || '-')}</td>
                <td class="${session.status === 'active' ? 'status-active' : 'status-closed'}">${session.status || '-'}</td>
                <td>${session.message_count || 0}</td>
                <td>${session.evaluation_count || 0}</td>
                <td title="${session.latest_scenario || ''}">${ScenarioLabels.getScenarioLabel(session.latest_scenario)}</td>
                <td>${getProblemTypeTag(session.latest_problem_type)}</td>
                <td>${session.has_alert ? '<span class="tag tag-alert">是</span>' : '<span class="tag tag-no-alert">否</span>'}</td>
                <td>${getAlertLevelText(session.highest_alert_level)}</td>
                <td>${formatDate(session.started_at || session.created_at)}</td>
                <td><a class="action-link" onclick="openSessionDetail('${session.session_id}')">查看</a></td>
            </tr>
        `).join('');

        // 渲染分页
        renderPagination(data.total || 0, currentPage, pageSize);

    } catch (error) {
        console.error('加载会话列表失败:', error);
        tbody.innerHTML = `<tr><td colspan="12" class="error-message">加载失败: ${escapeHtml(error.message)}</td></tr>`;
        showMessage('error', `加载会话列表失败: ${error.message}`);
    }
}

/**
 * 渲染分页
 */
function renderPagination(total, page, size) {
    const totalPages = Math.ceil(total / size);
    const pagination = document.getElementById('pagination');
    
    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '';
    
    // 上一页
    html += `<button onclick="loadSessions(${page - 1})" ${page === 1 ? 'disabled' : ''}>上一页</button>`;
    
    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
            html += `<button onclick="loadSessions(${i})" ${i === page ? 'style="background:#1890ff;color:white;border-color:#1890ff"' : ''}>${i}</button>`;
        } else if (i === page - 3 || i === page + 3) {
            html += `<span>...</span>`;
        }
    }
    
    // 下一页
    html += `<button onclick="loadSessions(${page + 1})" ${page === totalPages ? 'disabled' : ''}>下一页</button>`;
    
    pagination.innerHTML = html;
}

/**
 * 打开会话详情
 */
async function openSessionDetail(sessionId) {
    const modal = document.getElementById('detail-modal');
    const content = document.getElementById('detail-content');
    
    modal.classList.add('active');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const detail = await APIClient.getQualitySessionDetail(sessionId);
        currentDetail = detail;

        renderSessionDetail(detail);
    } catch (error) {
        console.error('加载会话详情失败:', error);
        content.innerHTML = `<div class="error-message">加载失败: ${escapeHtml(error.message)}</div>`;
        showMessage('error', `加载会话详情失败: ${error.message}`);
    }
}

/**
 * 渲染会话详情
 */
function renderSessionDetail(detail) {
    const content = document.getElementById('detail-content');
    const { session, messages, evaluations, alerts } = detail;

    content.innerHTML = `
        <!-- 会话基础信息 -->
        <div class="detail-section">
            <h3>会话基础信息</h3>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">会话ID</div>
                    <div class="info-value"><code>${escapeHtml(session.session_id || '')}</code></div>
                </div>
                <div class="info-item">
                    <div class="info-label">项目</div>
                    <div class="info-value">${escapeHtml(session.project || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Chat ID</div>
                    <div class="info-value">${escapeHtml(session.chat_id || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">客服</div>
                    <div class="info-value">${escapeHtml(session.agent_id || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">状态</div>
                    <div class="info-value">${session.status || '-'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">开始时间</div>
                    <div class="info-value">${formatDate(session.started_at)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">更新时间</div>
                    <div class="info-value">${formatDate(session.updated_at)}</div>
                </div>
            </div>
        </div>

        <!-- 消息时间线 -->
        <div class="detail-section">
            <h3>消息时间线 (${(messages || []).length} 条)</h3>
            <div class="message-timeline">
                ${renderMessageTimeline(messages || [])}
            </div>
        </div>

        <!-- 分析结果 -->
        <div class="detail-section">
            <h3>分析结果 (${(evaluations || []).length} 条)</h3>
            ${renderEvaluations(evaluations || [])}
        </div>

        <!-- 告警记录 -->
        <div class="detail-section">
            <h3>告警记录 (${(alerts || []).length} 条)</h3>
            ${renderAlerts(alerts || [])}
        </div>
    `;
}

/**
 * 渲染消息时间线
 */
function renderMessageTimeline(messages) {
    if (messages.length === 0) {
        return '<div class="empty">暂无消息</div>';
    }

    // 按时间排序
    const sorted = [...messages].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return sorted.map(msg => `
        <div class="message-item ${msg.role}">
            <div class="message-bubble">
                <div class="message-meta">
                    ${escapeHtml(msg.sender_name || msg.role || '')} • ${formatDate(msg.timestamp)}
                </div>
                <div class="message-content">
                    ${escapeHtml(msg.content || '空消息')}
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * 渲染分析结果
 */
function renderEvaluations(evaluations) {
    if (evaluations.length === 0) {
        return '<div class="empty">暂无分析结果</div>';
    }

    return evaluations.map(eval_ => `
        <div style="margin-bottom: 20px; padding: 15px; background: #fafafa; border-radius: 4px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <div>
                    <strong>分析ID:</strong> <code>${escapeHtml(eval_.evaluation_id || eval_.id || '')}</code>
                    <span style="margin-left: 15px;">${getProblemTypeTag(eval_.problem_type)}</span>
                    ${eval_.has_alert ? '<span class="tag tag-alert" style="margin-left: 10px;">有告警</span>' : ''}
                </div>
                <button class="btn-primary" onclick="openEvalDetail('${eval_.evaluation_id || eval_.id}')" style="padding: 4px 12px; font-size: 12px;">查看详情</button>
            </div>
            <div class="info-grid" style="margin-top: 10px;">
                <div class="info-item">
                    <div class="info-label">场景</div>
                    <div class="info-value" title="${eval_.scenario || ''}">${ScenarioLabels.getScenarioLabel(eval_.scenario)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">判断结果</div>
                    <div class="info-value">${escapeHtml(eval_.judgement || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">分类原因</div>
                    <div class="info-value">${escapeHtml(eval_.classify_reason || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">需要审核</div>
                    <div class="info-value">${eval_.need_review ? '是' : '否'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">告警等级</div>
                    <div class="info-value">${getAlertLevelText(eval_.alert_level)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">分析时间</div>
                    <div class="info-value">${formatDate(eval_.created_at)}</div>
                </div>
            </div>
            ${eval_.summary ? `<div style="margin-top: 10px;"><strong>摘要:</strong> ${escapeHtml(eval_.summary)}</div>` : ''}
        </div>
    `).join('');
}

/**
 * 渲染告警记录
 */
function renderAlerts(alerts) {
    if (alerts.length === 0) {
        return '<div class="empty">暂无告警</div>';
    }

    return `
        <table>
            <thead>
                <tr>
                    <th>告警ID</th>
                    <th>告警等级</th>
                    <th>告警类型</th>
                    <th>告警原因</th>
                    <th>状态</th>
                    <th>创建时间</th>
                </tr>
            </thead>
            <tbody>
                ${alerts.map(alert => `
                    <tr>
                        <td><code>${escapeHtml(alert.id || alert.alert_id || '')}</code></td>
                        <td>${getAlertLevelText(alert.alert_level)}</td>
                        <td>${escapeHtml(alert.alert_type || '-')}</td>
                        <td>${escapeHtml(alert.alert_reason || '-')}</td>
                        <td>${escapeHtml(alert.status || '-')}</td>
                        <td>${formatDate(alert.created_at)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

/**
 * 打开 Evaluation 详情
 */
async function openEvalDetail(evaluationId) {
    const modal = document.getElementById('eval-modal');
    const content = document.getElementById('eval-detail-content');
    
    modal.classList.add('active');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const detail = await APIClient.getQualityEvaluationDetail(evaluationId);
        renderEvalDetail(detail);
    } catch (error) {
        console.error('加载分析详情失败:', error);
        content.innerHTML = `<div class="error-message">加载失败: ${escapeHtml(error.message)}</div>`;
        showMessage('error', `加载分析详情失败: ${error.message}`);
    }
}

/**
 * 渲染 Evaluation 详情
 */
function renderEvalDetail(detail) {
    const content = document.getElementById('eval-detail-content');

    content.innerHTML = `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">分析ID</div>
                <div class="info-value"><code>${escapeHtml(detail.evaluation_id || detail.id || '')}</code></div>
            </div>
            <div class="info-item">
                <div class="info-label">场景</div>
                <div class="info-value" title="${detail.scenario || ''}">${ScenarioLabels.getScenarioLabel(detail.scenario)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">问题类型</div>
                <div class="info-value">${getProblemTypeText(detail.problem_type)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">判断结果</div>
                <div class="info-value">${escapeHtml(detail.judgement || '-')}</div>
            </div>
            <div class="info-item">
                <div class="info-label">需要审核</div>
                <div class="info-value">${detail.need_review ? '是' : '否'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">告警等级</div>
                <div class="info-value">${getAlertLevelText(detail.alert_level)}</div>
            </div>
        </div>

        ${detail.classify_reason ? `
        <div style="margin-top: 20px;">
            <h4>分类原因</h4>
            <div style="padding: 10px; background: #fafafa; border-radius: 4px; margin-top: 5px;">
                ${escapeHtml(detail.classify_reason)}
            </div>
        </div>
        ` : ''}

        ${detail.summary ? `
        <div style="margin-top: 20px;">
            <h4>摘要</h4>
            <div style="padding: 10px; background: #fafafa; border-radius: 4px; margin-top: 5px;">
                ${escapeHtml(detail.summary)}
            </div>
        </div>
        ` : ''}

        ${detail.input_payload ? `
        <div style="margin-top: 20px;">
            <h4>输入数据</h4>
            <div class="json-display">${formatJson(detail.input_payload)}</div>
        </div>
        ` : ''}

        ${detail.output_payload ? `
        <div style="margin-top: 20px;">
            <h4>输出数据</h4>
            <div class="json-display">${formatJson(detail.output_payload)}</div>
        </div>
        ` : ''}
    `;
}

/**
 * 关闭模态框
 */
function closeModal() {
    const modal = document.getElementById('detail-modal');
    modal.classList.remove('active');
    currentDetail = null;
}

/**
 * 关闭 Evaluation 模态框
 */
function closeEvalModal() {
    const modal = document.getElementById('eval-modal');
    modal.classList.remove('active');
}

/**
 * 重置筛选条件
 */
function resetFilters() {
    document.getElementById('filter-project').value = '';
    document.getElementById('filter-agent-id').value = '';
    document.getElementById('filter-scenario').value = '';
    document.getElementById('filter-problem-type').value = '';
    document.getElementById('filter-has-alert').value = '';
    document.getElementById('filter-alert-level').value = '';
    document.getElementById('filter-start-time').value = '';
    document.getElementById('filter-end-time').value = '';
    
    loadSessions(1);
}

/**
 * 显示消息
 */
function showMessage(type, message) {
    const container = document.getElementById('message-container');
    const div = document.createElement('div');
    div.className = type === 'error' ? 'error-message' : 'success-message';
    div.textContent = message;
    container.appendChild(div);

    setTimeout(() => {
        div.remove();
    }, 5000);
}

/**
 * 工具函数：转义 HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 工具函数：格式化日期
 */
function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return dateStr;
    }
}

/**
 * 工具函数：格式化 JSON
 */
function formatJson(data) {
    if (!data) return '-';
    
    try {
        // 如果是字符串，尝试 parse
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        return JSON.stringify(parsed, null, 2);
    } catch (error) {
        // parse 失败，返回原始文本
        return typeof data === 'string' ? data : JSON.stringify(data);
    }
}

/**
 * 工具函数：获取问题类型标签
 */
function getProblemTypeTag(type) {
    if (!type) return '<span class="tag tag-no-alert">-</span>';
    const className = type === 'unknown' ? 'tag-unknown' : 'tag-known';
    return `<span class="tag ${className}">${type}</span>`;
}

/**
 * 工具函数：获取问题类型文本
 */
function getProblemTypeText(type) {
    return type || '-';
}

/**
 * 工具函数：获取告警等级文本
 */
function getAlertLevelText(level) {
    const levelMap = {
        'none': '无',
        'warning': '警告',
        'critical': '严重'
    };
    return levelMap[level] || level || 'none';
}
