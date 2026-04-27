/**
 * Dashboard Page - 基础统计看板页面逻辑
 */

/**
 * 页面初始化
 */
window.onload = async () => {
    await loadAllStats();
};

/**
 * 加载所有统计数据
 */
async function loadAllStats() {
    try {
        const params = getFilterParams();
        
        // 并行加载所有统计数据
        await Promise.allSettled([
            loadOverview(params),
            loadTraining(params),
            loadQuality(params),
            loadAlerts(params),
            loadReviews(params),
            loadKnowledge(params),
            loadTrend(params),
            loadAgents(params)
        ]);
    } catch (error) {
        console.error('加载统计数据失败:', error);
        showMessage('error', `加载统计数据失败: ${error.message}`);
    }
}

/**
 * 获取筛选参数
 */
function getFilterParams() {
    return {
        project: document.getElementById('filter-project').value || undefined,
        start_time: document.getElementById('filter-start-time').value || undefined,
        end_time: document.getElementById('filter-end-time').value || undefined
    };
}

/**
 * 加载总览统计
 */
async function loadOverview(params) {
    try {
        const data = await APIClient.getStatsOverview();
        
        // 更新总览卡片
        document.getElementById('stat-training-sessions').textContent = data.total_training_sessions || 0;
        document.getElementById('stat-quality-sessions').textContent = data.total_quality_sessions || 0;
        document.getElementById('stat-evaluations').textContent = data.total_evaluations || 0;
        document.getElementById('stat-unknown').textContent = data.unknown_count || 0;
        document.getElementById('stat-alerts').textContent = data.total_alerts || 0;
        document.getElementById('stat-pending').textContent = data.pending_reviews || 0;
        document.getElementById('stat-reviewed').textContent = data.total_reviewed || 0;
        document.getElementById('stat-knowledge').textContent = data.total_knowledge || 0;
    } catch (error) {
        console.error('加载总览统计失败:', error);
        showMessage('error', `加载总览统计失败: ${error.message}`);
    }
}

/**
 * 加载训练统计
 */
async function loadTraining(params) {
    const container = document.getElementById('training-stats');
    
    try {
        const data = await APIClient.getStatsTraining(params);
        
        container.innerHTML = `
            <div class="info-item">
                <div class="info-label">总会话数</div>
                <div class="info-value large">${data.total_sessions || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">已完成</div>
                <div class="info-value">${data.finished_sessions || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">已中断</div>
                <div class="info-value">${data.interrupted_sessions || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">总轮次</div>
                <div class="info-value large">${data.total_rounds || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">平均轮次</div>
                <div class="info-value">${formatNumber(data.avg_rounds || 0)}</div>
            </div>
        `;
    } catch (error) {
        console.error('加载训练统计失败:', error);
        container.innerHTML = `<div class="error-message">加载失败: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * 加载质检统计
 */
async function loadQuality(params) {
    const container = document.getElementById('quality-stats');
    
    try {
        const data = await APIClient.getStatsQuality(params);
        
        const unknownRate = data.unknown_rate ? (data.unknown_rate * 100).toFixed(2) + '%' : '0.00%';
        
        container.innerHTML = `
            <div class="info-item">
                <div class="info-label">总会话数</div>
                <div class="info-value large">${data.total_sessions || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">总消息数</div>
                <div class="info-value">${data.total_messages || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">总分析数</div>
                <div class="info-value large">${data.total_evaluations || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Known</div>
                <div class="info-value">${data.known_count || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Unknown</div>
                <div class="info-value">${data.unknown_count || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Unknown 率</div>
                <div class="info-value">${unknownRate}</div>
            </div>
        `;
    } catch (error) {
        console.error('加载质检统计失败:', error);
        container.innerHTML = `<div class="error-message">加载失败: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * 加载告警统计
 */
async function loadAlerts(params) {
    const container = document.getElementById('alerts-stats');
    const distContainer = document.getElementById('alerts-distribution');
    
    try {
        const data = await APIClient.getStatsAlerts(params);
        
        container.innerHTML = `
            <div class="info-item">
                <div class="info-label">总告警数</div>
                <div class="info-value large">${data.total_alerts || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">严重告警</div>
                <div class="info-value">${data.high_alert_count || data.critical_alert_count || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">中等告警</div>
                <div class="info-value">${data.medium_alert_count || data.warning_alert_count || 0}</div>
            </div>
        `;
        
        // 渲染告警类型分布
        const distribution = data.alert_type_distribution || [];
        if (distribution.length > 0) {
            distContainer.innerHTML = `
                <h3 style="margin-top: 20px; margin-bottom: 10px;">告警类型分布</h3>
                <div class="distribution-bar">
                    ${distribution.map(item => renderDistributionItem(item.label || item.type, item.count || item.value)).join('')}
                </div>
            `;
        }
    } catch (error) {
        console.error('加载告警统计失败:', error);
        container.innerHTML = `<div class="error-message">加载失败: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * 加载审核统计
 */
async function loadReviews(params) {
    const container = document.getElementById('reviews-stats');
    
    try {
        const data = await APIClient.getStatsReviews(params);
        
        const approvalRate = data.approval_rate ? (data.approval_rate * 100).toFixed(2) + '%' : '0.00%';
        const totalReviewed = (data.approved_count || 0) + (data.modified_approved_count || 0) + (data.rejected_count || 0);
        
        container.innerHTML = `
            <div class="info-item">
                <div class="info-label">待审核</div>
                <div class="info-value">${data.pending_count || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">已通过</div>
                <div class="info-value">${data.approved_count || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">修改后通过</div>
                <div class="info-value">${data.modified_approved_count || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">已拒绝</div>
                <div class="info-value">${data.rejected_count || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">总审核数</div>
                <div class="info-value large">${totalReviewed}</div>
            </div>
            <div class="info-item">
                <div class="info-label">通过率</div>
                <div class="info-value">${approvalRate}</div>
            </div>
        `;
    } catch (error) {
        console.error('加载审核统计失败:', error);
        container.innerHTML = `<div class="error-message">加载失败: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * 加载知识库统计
 */
async function loadKnowledge(params) {
    const container = document.getElementById('knowledge-stats');
    const distContainer = document.getElementById('knowledge-distribution');
    
    try {
        const data = await APIClient.getStatsKnowledge(params);
        
        container.innerHTML = `
            <div class="info-item">
                <div class="info-label">总知识数</div>
                <div class="info-value large">${data.total_knowledge || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">启用中</div>
                <div class="info-value">${data.active_count || 0}</div>
            </div>
            <div class="info-item">
                <div class="info-label">已停用</div>
                <div class="info-value">${data.deprecated_count || 0}</div>
            </div>
        `;
        
        // 渲染场景分布
        const scenarioDist = data.scenario_distribution || [];
        if (scenarioDist.length > 0) {
            distContainer.innerHTML = `
                <h3 style="margin-top: 20px; margin-bottom: 10px;">场景分布</h3>
                <table>
                    <thead>
                        <tr>
                            <th>场景</th>
                            <th>数量</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${scenarioDist.map(item => `
                            <tr>
                                <td><span class="tag tag-scenario" title="${escapeHtml(item.scenario || '')}">${escapeHtml(ScenarioLabels.getScenarioLabel(item.scenario))}</span></td>
                                <td>${item.count || 0}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }
    } catch (error) {
        console.error('加载知识库统计失败:', error);
        container.innerHTML = `<div class="error-message">加载失败: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * 加载趋势数据
 */
async function loadTrend(params) {
    const tbody = document.getElementById('trend-table-body');
    
    try {
        const data = await APIClient.getStatsTrend(params);
        const list = data.list || data.trend || [];
        
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="empty">暂无数据</td></tr>';
            return;
        }
        
        tbody.innerHTML = list.map(item => `
            <tr>
                <td>${formatDate(item.date || item.day)}</td>
                <td>${item.training_sessions || 0}</td>
                <td>${item.quality_sessions || 0}</td>
                <td>${item.evaluations || item.evaluation_count || 0}</td>
                <td>${item.unknown_count || 0}</td>
                <td>${item.alert_count || 0}</td>
                <td>${item.review_count || 0}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('加载趋势数据失败:', error);
        tbody.innerHTML = `<tr><td colspan="7" class="error-message">加载失败: ${escapeHtml(error.message)}</td></tr>`;
    }
}

/**
 * 加载客服维度统计
 */
async function loadAgents(params) {
    const tbody = document.getElementById('agents-table-body');
    
    try {
        const data = await APIClient.getStatsAgents(params);
        const list = data.list || data.agents || [];
        
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="empty">暂无数据</td></tr>';
            return;
        }
        
        tbody.innerHTML = list.map(item => `
            <tr>
                <td><code>${escapeHtml(item.agent_id || '')}</code></td>
                <td>${item.training_sessions || 0}</td>
                <td>${item.training_rounds || 0}</td>
                <td>${item.quality_sessions || 0}</td>
                <td>${item.quality_evaluations || 0}</td>
                <td>${item.unknown_count || 0}</td>
                <td>${item.alert_count || 0}</td>
                <td>${item.high_alert_count || item.critical_alert_count || 0}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('加载客服维度统计失败:', error);
        tbody.innerHTML = `<tr><td colspan="8" class="error-message">加载失败: ${escapeHtml(error.message)}</td></tr>`;
    }
}

/**
 * 渲染分布项
 */
function renderDistributionItem(label, count) {
    const maxCount = 100; // 简化处理
    const percentage = Math.min((count / maxCount) * 100, 100);
    
    return `
        <div class="distribution-item">
            <div class="distribution-label">
                <span>${escapeHtml(label)}</span>
                <span>${count}</span>
            </div>
            <div class="distribution-track">
                <div class="distribution-fill" style="width: ${percentage}%"></div>
            </div>
        </div>
    `;
}

/**
 * 重置筛选条件
 */
function resetFilters() {
    document.getElementById('filter-project').value = '';
    document.getElementById('filter-start-time').value = '';
    document.getElementById('filter-end-time').value = '';
    
    loadAllStats();
}

/**
 * 显示消息
 */
function showMessage(type, message) {
    const container = document.getElementById('message-container');
    const div = document.createElement('div');
    div.className = 'error-message';
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
        return date.toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    } catch (error) {
        return dateStr;
    }
}

/**
 * 工具函数：格式化数字
 */
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return typeof num === 'number' ? num.toFixed(2) : num;
}
