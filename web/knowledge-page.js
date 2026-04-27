/**
 * Knowledge Page - 知识库管理页面逻辑
 */

let currentKnowledgeList = [];
let currentDetail = null;
let currentPage = 1;
const pageSize = 20;

/**
 * 页面初始化
 */
window.onload = async () => {
    await loadKnowledgeList();
};

/**
 * 加载知识库列表
 */
async function loadKnowledgeList(page = 1) {
    currentPage = page;
    const tbody = document.getElementById('knowledge-table-body');
    tbody.innerHTML = '<tr><td colspan="11" class="loading">加载中...</td></tr>';

    try {
        const params = {
            page: currentPage,
            page_size: pageSize,
            project: document.getElementById('filter-project').value || undefined,
            scenario: document.getElementById('filter-scenario').value || undefined,
            status: document.getElementById('filter-status').value || undefined,
            keyword: document.getElementById('filter-keyword').value || undefined
        };

        const data = await APIClient.getKnowledgeList(params);
        currentKnowledgeList = data.list || [];

        if (currentKnowledgeList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="empty">暂无数据</td></tr>';
            document.getElementById('pagination').innerHTML = '';
            return;
        }

        // 渲染表格
        tbody.innerHTML = currentKnowledgeList.map(item => {
            // 适配驼峰和下划线两种命名
            const knowledgeId = item.knowledge_id || item.knowledgeId || item.id || '';
            const project = item.project || '-';
            const scenario = item.scenario || '-';
            const questionAliases = item.question_aliases || item.questionAliases || [];
            const standardAnswer = item.standard_answer || item.standardAnswer || '';
            const version = item.version || 1;
            const status = item.status || 'active';
            const sourceReviewId = item.source_review_id || item.sourceReviewId || '-';
            const sourceEvaluationId = item.source_evaluation_id || item.sourceEvaluationId || item.source_suggestion_id || '-';
            const createdAt = item.created_at || item.createdAt;

            return `
            <tr>
                <td><code>${escapeHtml(knowledgeId)}</code></td>
                <td>${escapeHtml(project)}</td>
                <td title="${scenario}">${ScenarioLabels.getScenarioLabel(scenario)}</td>
                <td>${renderAliases(questionAliases)}</td>
                <td>${truncate(escapeHtml(standardAnswer), 50)}</td>
                <td>v${version}</td>
                <td>${getStatusTag(status)}</td>
                <td>${escapeHtml(sourceReviewId)}</td>
                <td>${escapeHtml(sourceEvaluationId)}</td>
                <td>${formatDate(createdAt)}</td>
                <td>
                    <div class="action-group">
                        <button class="btn-link" onclick="openDetail('${knowledgeId}')">查看</button>
                        <button class="btn-link" onclick="openEditModal('${knowledgeId}')">编辑</button>
                        ${status === 'active' ? `<button class="btn-link" style="color: #ff4d4f;" onclick="deprecateKnowledge('${knowledgeId}')">停用</button>` : ''}
                        <button class="btn-link" onclick="openVersionsModal('${knowledgeId}')">版本</button>
                    </div>
                </td>
            </tr>
            `;
        }).join('');

        // 渲染分页
        renderPagination(data.total || 0, currentPage, pageSize);

    } catch (error) {
        console.error('加载知识库列表失败:', error);
        tbody.innerHTML = `<tr><td colspan="11" class="error-message">加载失败: ${escapeHtml(error.message)}</td></tr>`;
        showMessage('error', `加载知识库列表失败: ${error.message}`);
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
    html += `<button onclick="loadKnowledgeList(${page - 1})" ${page === 1 ? 'disabled' : ''}>上一页</button>`;
    
    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
            html += `<button onclick="loadKnowledgeList(${i})" ${i === page ? 'style="background:#1890ff;color:white;border-color:#1890ff"' : ''}>${i}</button>`;
        } else if (i === page - 3 || i === page + 3) {
            html += `<span>...</span>`;
        }
    }
    
    // 下一页
    html += `<button onclick="loadKnowledgeList(${page + 1})" ${page === totalPages ? 'disabled' : ''}>下一页</button>`;
    
    pagination.innerHTML = html;
}

/**
 * 打开详情
 */
async function openDetail(knowledgeId) {
    const modal = document.getElementById('detail-modal');
    const content = document.getElementById('detail-content');
    
    modal.classList.add('active');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const detail = await APIClient.getKnowledgeDetail(knowledgeId);
        currentDetail = detail;

        renderDetail(detail);
    } catch (error) {
        console.error('加载知识详情失败:', error);
        content.innerHTML = `<div class="error-message">加载失败: ${escapeHtml(error.message)}</div>`;
        showMessage('error', `加载知识详情失败: ${error.message}`);
    }
}

/**
 * 渲染详情
 */
function renderDetail(detail) {
    const content = document.getElementById('detail-content');

    // 适配驼峰和下划线两种命名
    const knowledgeId = detail.knowledge_id || detail.knowledgeId || detail.id || '';
    const project = detail.project || '-';
    const scenario = detail.scenario || '-';
    const version = detail.version || 1;
    const status = detail.status || 'active';
    const questionAliases = detail.question_aliases || detail.questionAliases || [];
    const standardAnswer = detail.standard_answer || detail.standardAnswer || '';
    const rules = detail.rules;
    const sourceReviewId = detail.source_review_id || detail.sourceReviewId || '-';
    const sourceSuggestionId = detail.source_suggestion_id || detail.sourceSuggestionId || '-';
    const sourceEvaluationId = detail.source_evaluation_id || detail.sourceEvaluationId || '-';
    const sourceSessionId = detail.source_session_id || detail.sourceSessionId || '-';
    const createdAt = detail.created_at || detail.createdAt;
    const updatedAt = detail.updated_at || detail.updatedAt;

    content.innerHTML = `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">知识ID</div>
                <div class="info-value"><code>${escapeHtml(knowledgeId)}</code></div>
            </div>
            <div class="info-item">
                <div class="info-label">项目</div>
                <div class="info-value">${escapeHtml(project)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">场景</div>
                <div class="info-value" title="${scenario}">${ScenarioLabels.getScenarioLabel(scenario)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">版本</div>
                <div class="info-value">v${version}</div>
            </div>
            <div class="info-item">
                <div class="info-label">状态</div>
                <div class="info-value">${getStatusTag(status)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">创建时间</div>
                <div class="info-value">${formatDate(createdAt)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">更新时间</div>
                <div class="info-value">${formatDate(updatedAt)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">来源审核</div>
                <div class="info-value">${escapeHtml(sourceReviewId)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">来源建议</div>
                <div class="info-value">${escapeHtml(sourceSuggestionId)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">来源分析</div>
                <div class="info-value">${escapeHtml(sourceEvaluationId)}</div>
            </div>
            <div class="info-item">
                <div class="info-label">来源会话</div>
                <div class="info-value">${escapeHtml(sourceSessionId)}</div>
            </div>
        </div>

        <div class="detail-section" style="margin-top: 20px;">
            <h3>问法别名</h3>
            <div class="array-display">
                ${renderAliases(questionAliases)}
            </div>
        </div>

        <div class="detail-section">
            <h3>标准答案</h3>
            <div style="padding: 15px; background: #fafafa; border-radius: 4px; line-height: 1.6;">
                ${escapeHtml(standardAnswer)}
            </div>
        </div>

        <div class="detail-section">
            <h3>规则</h3>
            <div class="json-display">
                ${formatJson(rules)}
            </div>
        </div>
    `;
}

/**
 * 打开新增模态框
 */
function openCreateModal() {
    document.getElementById('edit-modal-title').textContent = '新增知识';
    document.getElementById('form-knowledge-id').value = '';
    document.getElementById('form-update-reason').value = '';
    document.getElementById('form-project').value = 'default';
    document.getElementById('form-scenario').value = '';
    document.getElementById('form-aliases').value = '';
    document.getElementById('form-answer').value = '';
    document.getElementById('form-keywords').value = '';
    document.getElementById('form-required').value = '';
    document.getElementById('form-forbidden').value = '';
    
    document.getElementById('edit-modal').classList.add('active');
}

/**
 * 打开编辑模态框
 */
async function openEditModal(knowledgeId) {
    try {
        const detail = await APIClient.getKnowledgeDetail(knowledgeId);
        
        document.getElementById('edit-modal-title').textContent = '编辑知识';
        document.getElementById('form-knowledge-id').value = knowledgeId;
        document.getElementById('form-update-reason').value = '页面联调更新';
        document.getElementById('form-project').value = detail.project || 'default';
        document.getElementById('form-scenario').value = detail.scenario || '';
        
        // 处理 question_aliases（可能是数组或字符串）
        const aliases = parseAliases(detail.question_aliases);
        document.getElementById('form-aliases').value = aliases.join('\n');
        
        document.getElementById('form-answer').value = detail.standard_answer || '';
        
        // 处理 rules
        const rules = parseRules(detail.rules);
        document.getElementById('form-keywords').value = (rules.keywords || []).join(', ');
        document.getElementById('form-required').value = (rules.required_info || []).join(', ');
        document.getElementById('form-forbidden').value = (rules.forbidden || []).join(', ');
        
        document.getElementById('edit-modal').classList.add('active');
    } catch (error) {
        showMessage('error', `加载知识详情失败: ${error.message}`);
    }
}

/**
 * 提交知识（新增或更新）
 */
async function submitKnowledge() {
    const knowledgeId = document.getElementById('form-knowledge-id').value;
    const project = document.getElementById('form-project').value.trim();
    const scenario = document.getElementById('form-scenario').value.trim();
    const aliasesText = document.getElementById('form-aliases').value.trim();
    const answer = document.getElementById('form-answer').value.trim();
    const keywordsText = document.getElementById('form-keywords').value.trim();
    const requiredText = document.getElementById('form-required').value.trim();
    const forbiddenText = document.getElementById('form-forbidden').value.trim();
    const updateReason = document.getElementById('form-update-reason').value.trim();

    // 验证必填字段
    if (!project || !scenario || !aliasesText || !answer) {
        showMessage('error', '请填写所有必填字段');
        return;
    }

    try {
        const aliases = aliasesText.split('\n').filter(a => a.trim());
        const keywords = keywordsText ? keywordsText.split(',').map(k => k.trim()).filter(k => k) : [];
        const required = requiredText ? requiredText.split(',').map(r => r.trim()).filter(r => r) : [];
        const forbidden = forbiddenText ? forbiddenText.split(',').map(f => f.trim()).filter(f => f) : [];

        if (knowledgeId) {
            // 更新
            const data = {
                knowledge_id: knowledgeId,
                question_aliases: aliases,
                standard_answer: answer,
                rules: {
                    keywords,
                    required_info: required,
                    forbidden
                },
                operator_id: 'manager_001',
                update_reason: updateReason || '页面联调更新'
            };

            await APIClient.updateKnowledge(data);
            showMessage('success', '知识更新成功');
        } else {
            // 新增
            const data = {
                project,
                scenario,
                question_aliases: aliases,
                standard_answer: answer,
                rules: {
                    keywords,
                    required_info: required,
                    forbidden
                },
                operator_id: 'manager_001'
            };

            await APIClient.createKnowledge(data);
            showMessage('success', '知识新增成功');
        }

        closeModal('edit-modal');
        
        // 刷新列表
        setTimeout(() => {
            loadKnowledgeList(currentPage);
        }, 500);

    } catch (error) {
        console.error('提交知识失败:', error);
        showMessage('error', `提交失败: ${error.message}`);
    }
}

/**
 * 停用知识
 */
async function deprecateKnowledge(knowledgeId) {
    if (!confirm('确定要停用这条知识吗？')) {
        return;
    }

    try {
        const data = {
            knowledge_id: knowledgeId,
            status: 'deprecated',
            operator_id: 'manager_001',
            reason: '页面联调测试停用'
        };

        await APIClient.updateKnowledgeStatus(data);
        showMessage('success', '知识已停用');
        
        // 刷新列表
        setTimeout(() => {
            loadKnowledgeList(currentPage);
        }, 500);

    } catch (error) {
        console.error('停用知识失败:', error);
        showMessage('error', `停用失败: ${error.message}`);
    }
}

/**
 * 打开版本历史模态框
 */
async function openVersionsModal(knowledgeId) {
    const modal = document.getElementById('versions-modal');
    const content = document.getElementById('versions-content');
    
    modal.classList.add('active');
    content.innerHTML = '<div class="loading">加载中...</div>';

    try {
        const response = await APIClient.getKnowledgeVersions(knowledgeId);
        
        // 版本数据归一化：兼容多种返回结构
        const rawVersions =
            response?.data?.list ||
            response?.data?.versions ||
            response?.data?.items ||
            response?.data ||
            response?.list ||
            response?.versions ||
            response?.items ||
            response;

        const versions = Array.isArray(rawVersions)
            ? rawVersions
            : Array.isArray(rawVersions?.list)
                ? rawVersions.list
                : Array.isArray(rawVersions?.versions)
                    ? rawVersions.versions
                    : Array.isArray(rawVersions?.items)
                        ? rawVersions.items
                        : [];

        renderVersions(versions);
    } catch (error) {
        console.error('加载版本历史失败:', error);
        content.innerHTML = `<div class="error-message">加载失败: ${escapeHtml(error.message)}</div>`;
        showMessage('error', `加载版本历史失败: ${error.message}`);
    }
}

/**
 * 渲染版本历史
 */
function renderVersions(versions) {
    const content = document.getElementById('versions-content');

    if (!versions || versions.length === 0) {
        content.innerHTML = '<div class="empty">暂无版本历史</div>';
        return;
    }

    content.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>版本</th>
                    <th>状态</th>
                    <th>标准答案</th>
                    <th>来源审核</th>
                    <th>创建时间</th>
                </tr>
            </thead>
            <tbody>
                ${versions.map(v => {
                    // 兼容驼峰和下划线字段
                    const version = v.version || v.knowledge_version || 1;
                    const status = v.status || '-';
                    const standardAnswer = v.standardAnswer || v.standard_answer || '-';
                    const sourceReviewId = v.sourceReviewId || v.source_review_id || '-';
                    const createdAt = v.createdAt || v.created_at;

                    return `
                    <tr>
                        <td>v${version}</td>
                        <td>${getStatusTag(status)}</td>
                        <td>${truncate(escapeHtml(standardAnswer), 80)}</td>
                        <td>${escapeHtml(sourceReviewId)}</td>
                        <td>${formatDate(createdAt)}</td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

/**
 * 重置筛选条件
 */
function resetFilters() {
    document.getElementById('filter-project').value = '';
    document.getElementById('filter-scenario').value = '';
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-keyword').value = '';
    
    loadKnowledgeList(1);
}

/**
 * 关闭模态框
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    modal.classList.remove('active');
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
 * 渲染问法别名
 */
function renderAliases(aliases) {
    const parsed = parseAliases(aliases);
    
    if (parsed.length === 0) {
        return '<span style="color: #999;">暂无问法</span>';
    }

    return parsed.map(a => `<span class="array-item">${escapeHtml(a)}</span>`).join('');
}

/**
 * 解析问法别名
 */
function parseAliases(aliases) {
    if (!aliases) return [];
    
    if (Array.isArray(aliases)) {
        return aliases;
    }
    
    if (typeof aliases === 'string') {
        try {
            const parsed = JSON.parse(aliases);
            return Array.isArray(parsed) ? parsed : [aliases];
        } catch (error) {
            return aliases ? [aliases] : [];
        }
    }
    
    return [];
}

/**
 * 解析规则
 */
function parseRules(rules) {
    if (!rules) return {};
    
    if (typeof rules === 'object') {
        return rules;
    }
    
    if (typeof rules === 'string') {
        try {
            return JSON.parse(rules);
        } catch (error) {
            return {};
        }
    }
    
    return {};
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
    if (!data) return '暂无规则';
    
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
 * 工具函数：截断文本
 */
function truncate(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

/**
 * 工具函数：获取状态标签
 */
function getStatusTag(status) {
    if (!status) return '<span class="tag tag-deprecated">未知</span>';
    
    const className = status === 'active' ? 'tag-active' : 'tag-deprecated';
    const text = status === 'active' ? '启用' : '停用';
    
    return `<span class="tag ${className}">${text}</span>`;
}
