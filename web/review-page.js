/**
 * Review Page - 主管审核页面逻辑
 */

let currentTasks = [];
let currentTaskDetail = null;

/**
 * 加载审核任务列表
 */
async function loadTasks() {
    const tbody = document.getElementById('tasks-table-body');
    tbody.innerHTML = '<tr><td colspan="10" class="loading">加载中...</td></tr>';

    try {
        // 获取筛选条件
        const params = {
            page: 1,
            page_size: 20,
            status: document.getElementById('filter-status').value || undefined,
            project: document.getElementById('filter-project').value || undefined,
            agent_id: document.getElementById('filter-agent-id').value || undefined,
            scenario: document.getElementById('filter-scenario').value || undefined,
            alert_level: document.getElementById('filter-alert-level').value || undefined,
            start_time: document.getElementById('filter-start-time').value || undefined,
            end_time: document.getElementById('filter-end-time').value || undefined
        };

        const data = await APIClient.getReviewTasks(params);
        currentTasks = data.list || [];

        if (currentTasks.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="empty">暂无数据</td></tr>';
            return;
        }

        tbody.innerHTML = currentTasks.map(task => `
            <tr>
                <td>${escapeHtml(task.suggestion_id || task.task_id || '')}</td>
                <td>${escapeHtml(task.project || '-')}</td>
                <td>${escapeHtml(task.agent_id || '-')}</td>
                <td title="${escapeHtml(task.scenario || '')}">${escapeHtml(ScenarioLabels.getScenarioLabel(task.scenario))}</td>
                <td>${escapeHtml(task.problem_type || '-')}</td>
                <td title="${escapeHtml(task.suggested_reply_preview || '')}">${truncate(escapeHtml(task.suggested_reply_preview || ''), 30)}</td>
                <td>${getAlertLevelText(task.alert_level)}</td>
                <td class="${getStatusClass(task.status)}">${getStatusText(task.status)}</td>
                <td>${formatDate(task.created_at)}</td>
                <td><a class="action-link" onclick="openTaskDetail('${task.suggestion_id || task.task_id}')">查看</a></td>
            </tr>
        `).join('');

    } catch (error) {
        console.error('加载任务列表失败:', error);
        tbody.innerHTML = `<tr><td colspan="10" class="error-message">加载失败: ${escapeHtml(error.message)}</td></tr>`;
        showMessage('error', `加载任务列表失败: ${error.message}`);
    }
}

/**
 * 打开任务详情
 */
async function openTaskDetail(suggestionId) {
    const modal = document.getElementById('detail-modal');
    const content = document.getElementById('detail-content');
    
    modal.classList.add('active');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const detail = await APIClient.getReviewTaskDetail(suggestionId);
        currentTaskDetail = detail;

        renderTaskDetail(detail);
    } catch (error) {
        console.error('加载任务详情失败:', error);
        content.innerHTML = `<div class="error-message">加载失败: ${escapeHtml(error.message)}</div>`;
        showMessage('error', `加载任务详情失败: ${error.message}`);
    }
}

/**
 * 渲染任务详情
 */
function renderTaskDetail(detail) {
    const content = document.getElementById('detail-content');
    const { suggestion, session, conversation, evaluation, alerts, review } = detail;

    content.innerHTML = `
        <!-- 基础信息 -->
        <div class="detail-section">
            <h3>基础信息</h3>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">任务ID</div>
                    <div class="info-value">${escapeHtml(suggestion.suggestion_id || '')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">会话ID</div>
                    <div class="info-value">${escapeHtml(session?.session_id || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">项目</div>
                    <div class="info-value">${escapeHtml(session?.project || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">客服</div>
                    <div class="info-value">${escapeHtml(session?.agent_id || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">场景</div>
                    <div class="info-value" title="${escapeHtml(evaluation?.scenario || '')}">${escapeHtml(ScenarioLabels.getScenarioLabel(evaluation?.scenario))}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">问题类型</div>
                    <div class="info-value">${escapeHtml(evaluation?.problem_type || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">审核状态</div>
                    <div class="info-value">${getStatusText(suggestion.status)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">创建时间</div>
                    <div class="info-value">${formatDate(suggestion.created_at)}</div>
                </div>
            </div>
        </div>

        <!-- 原始会话 -->
        <div class="detail-section">
            <h3>原始会话</h3>
            <div id="conversation-container">
                ${renderConversation(conversation || [])}
            </div>
        </div>

        <!-- 分析结果 -->
        <div class="detail-section">
            <h3>分析结果</h3>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">场景识别</div>
                    <div class="info-value" title="${escapeHtml(evaluation?.scenario || '')}">${escapeHtml(ScenarioLabels.getScenarioLabel(evaluation?.scenario))}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">问题类型</div>
                    <div class="info-value">${escapeHtml(evaluation?.problem_type || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">分类原因</div>
                    <div class="info-value">${escapeHtml(evaluation?.classify_reason || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">判断结果</div>
                    <div class="info-value">${escapeHtml(evaluation?.judgement || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">需要审核</div>
                    <div class="info-value">${evaluation?.need_review ? '是' : '否'}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">置信度</div>
                    <div class="info-value">${evaluation?.confidence ? (evaluation.confidence * 100).toFixed(1) + '%' : '-'}</div>
                </div>
            </div>
        </div>

        <!-- AI 建议答案 -->
        <div class="detail-section">
            <h3>AI 建议答案</h3>
            <textarea class="readonly-textarea" readonly>${escapeHtml(suggestion.suggested_reply || '')}</textarea>
        </div>

        <!-- 审核操作区 -->
        ${suggestion.status === 'pending_review' ? `
        <div class="detail-section">
            <h3>审核操作</h3>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">原 AI 建议答案（只读）</label>
                <textarea id="original-reply" class="readonly-textarea" readonly>${escapeHtml(suggestion.suggested_reply || '')}</textarea>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">最终答案 <span style="color: #ff4d4f;">*</span></label>
                <textarea id="final-reply" placeholder="请输入最终答案">${escapeHtml(suggestion.suggested_reply || '')}</textarea>
            </div>
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 5px; font-weight: 500;">审核备注</label>
                <input type="text" id="review-note" placeholder="请输入审核备注（选填）">
            </div>
            <div class="action-buttons">
                <button class="btn btn-success" onclick="submitReview('approve')">通过</button>
                <button class="btn btn-primary" onclick="submitReview('modify_and_approve')">修改并通过</button>
                <button class="btn btn-danger" onclick="submitReview('reject')">拒绝</button>
                <button class="btn btn-secondary" onclick="closeModal()">取消</button>
            </div>
        </div>
        ` : `
        <div class="detail-section">
            <h3>审核结果</h3>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">审核动作</div>
                    <div class="info-value">${getReviewActionText(review?.review_action)}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">最终答案</div>
                    <div class="info-value">${escapeHtml(review?.final_reply || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">审核备注</div>
                    <div class="info-value">${escapeHtml(review?.review_note || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">审核人</div>
                    <div class="info-value">${escapeHtml(review?.reviewer_id || '-')}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">审核时间</div>
                    <div class="info-value">${formatDate(review?.created_at)}</div>
                </div>
            </div>
        </div>
        `}
    `;
}

/**
 * 渲染会话消息
 */
function renderConversation(messages) {
    if (!messages || messages.length === 0) {
        return '<div class="empty">暂无会话记录</div>';
    }

    return messages.map(msg => `
        <div class="conversation-message ${msg.role}">
            <div class="message-meta">
                ${msg.sender_name || msg.role} • ${formatDate(msg.timestamp)}
            </div>
            <div>${escapeHtml(msg.content || '')}</div>
        </div>
    `).join('');
}

/**
 * 提交审核
 */
async function submitReview(action) {
    const finalReply = document.getElementById('final-reply').value;
    const reviewNote = document.getElementById('review-note').value;

    // 验证
    if (action === 'modify_and_approve' && !finalReply.trim()) {
        showMessage('error', '修改并通过时，最终答案不能为空');
        return;
    }

    if (action === 'reject' && !reviewNote.trim()) {
        showMessage('error', '拒绝时，审核备注建议填写');
        return;
    }

    try {
        const submitData = {
            suggestion_id: currentTaskDetail.suggestion.suggestion_id,
            review_action: action,
            final_reply: finalReply || '',
            review_note: reviewNote || '',
            reviewer_id: 'manager_001' // TODO: 从登录信息获取
        };

        await APIClient.submitReview(submitData);

        showMessage('success', '审核提交成功');
        
        // 关闭模态框
        closeModal();
        
        // 刷新列表
        setTimeout(() => {
            loadTasks();
        }, 500);

    } catch (error) {
        console.error('提交审核失败:', error);
        showMessage('error', `提交失败: ${error.message}`);
    }
}

/**
 * 关闭模态框
 */
function closeModal() {
    const modal = document.getElementById('detail-modal');
    modal.classList.remove('active');
    currentTaskDetail = null;
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
 * 工具函数：截断文本
 */
function truncate(text, length) {
    if (!text) return '';
    return text.length > length ? text.substring(0, length) + '...' : text;
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
 * 工具函数：获取状态文本
 */
function getStatusText(status) {
    const statusMap = {
        'pending_review': '待审核',
        'approved': '已通过',
        'rejected': '已拒绝'
    };
    return statusMap[status] || status || '-';
}

/**
 * 工具函数：获取状态样式类
 */
function getStatusClass(status) {
    const classMap = {
        'pending_review': 'status-pending',
        'approved': 'status-approved',
        'rejected': 'status-rejected'
    };
    return classMap[status] || '';
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
    return levelMap[level] || level || '-';
}

/**
 * 工具函数：获取审核动作文本
 */
function getReviewActionText(action) {
    const actionMap = {
        'approve': '通过',
        'modify_and_approve': '修改并通过',
        'reject': '拒绝'
    };
    return actionMap[action] || action || '-';
}

// 页面加载时获取任务列表
window.onload = () => {
    loadTasks();
};
