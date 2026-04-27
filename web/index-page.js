/**
 * Index Page - 统一后台入口导航逻辑
 * 
 * 功能：
 * 1. 左侧菜单导航切换 iframe
 * 2. URL hash 路由支持
 * 3. 菜单高亮
 * 4. 加载状态管理
 * 5. 错误处理
 */

// 页面映射配置
const PAGE_CONFIG = {
    dashboard: {
        url: '/web/dashboard.html',
        name: '基础统计'
    },
    review: {
        url: '/web/review.html',
        name: '主管审核'
    },
    quality: {
        url: '/web/quality.html',
        name: '质检记录'
    },
    knowledge: {
        url: '/web/knowledge.html',
        name: '知识库管理'
    }
};

// 当前加载的页面
let currentPage = 'dashboard';
let isLoading = false;

/**
 * 初始化
 */
function init() {
    // 绑定菜单点击事件
    bindMenuEvents();
    
    // 监听 hash 变化
    window.addEventListener('hashchange', handleHashChange);
    
    // 根据初始 hash 加载页面
    loadPageFromHash();
}

/**
 * 绑定菜单点击事件
 */
function bindMenuEvents() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const page = item.dataset.page;
            if (page && page !== currentPage) {
                navigateTo(page);
            }
        });
    });
}

/**
 * 导航到指定页面
 * @param {string} page - 页面标识
 */
function navigateTo(page) {
    if (!PAGE_CONFIG[page]) {
        console.error(`未知页面: ${page}`);
        return;
    }

    // 更新 URL hash
    window.location.hash = page;
    
    // 加载页面
    loadPage(page);
}

/**
 * 根据 hash 加载页面
 */
function loadPageFromHash() {
    const hash = window.location.hash.slice(1); // 去掉 #
    
    if (hash && PAGE_CONFIG[hash]) {
        loadPage(hash);
    } else {
        // 默认加载 dashboard
        loadPage('dashboard');
    }
}

/**
 * 处理 hash 变化
 */
function handleHashChange() {
    loadPageFromHash();
}

/**
 * 加载页面到 iframe
 * @param {string} page - 页面标识
 */
function loadPage(page) {
    if (isLoading) return;
    
    const config = PAGE_CONFIG[page];
    if (!config) {
        showError('页面配置不存在', `未知的页面标识: ${page}`);
        return;
    }

    currentPage = page;
    isLoading = true;

    // 更新菜单高亮
    updateMenuHighlight(page);

    // 显示加载状态
    showLoading();
    hideError();

    // 获取 iframe
    const iframe = document.getElementById('content-iframe');
    
    // 设置加载超时
    const timeout = setTimeout(() => {
        if (isLoading) {
            showError('加载超时', '页面加载时间过长，请检查网络连接');
            isLoading = false;
        }
    }, 10000); // 10秒超时

    // 监听 iframe 加载完成
    iframe.onload = () => {
        clearTimeout(timeout);
        isLoading = false;
        hideLoading();
        hideError();
    };

    // 监听 iframe 加载失败
    iframe.onerror = () => {
        clearTimeout(timeout);
        isLoading = false;
        hideLoading();
        showError('加载失败', `无法加载页面: ${config.name}`);
    };

    // 加载页面
    try {
        iframe.src = config.url;
    } catch (error) {
        clearTimeout(timeout);
        isLoading = false;
        hideLoading();
        showError('加载异常', error.message);
    }
}

/**
 * 更新菜单高亮
 * @param {string} page - 页面标识
 */
function updateMenuHighlight(page) {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        if (item.dataset.page === page) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

/**
 * 显示加载状态
 */
function showLoading() {
    const loading = document.getElementById('loading');
    loading.classList.remove('hidden');
}

/**
 * 隐藏加载状态
 */
function hideLoading() {
    const loading = document.getElementById('loading');
    loading.classList.add('hidden');
}

/**
 * 显示错误信息
 * @param {string} title - 错误标题
 * @param {string} desc - 错误描述
 */
function showError(title, desc) {
    const error = document.getElementById('error');
    const errorTitle = error.querySelector('.error-title');
    const errorDesc = document.getElementById('error-desc');
    
    errorTitle.textContent = title;
    errorDesc.textContent = desc;
    error.classList.remove('hidden');
}

/**
 * 隐藏错误信息
 */
function hideError() {
    const error = document.getElementById('error');
    error.classList.add('hidden');
}

/**
 * 重新加载当前页面
 */
function retryLoad() {
    hideError();
    loadPage(currentPage);
}

/**
 * 获取当前页面标识
 * @returns {string}
 */
function getCurrentPage() {
    return currentPage;
}

/**
 * 获取所有页面配置
 * @returns {Object}
 */
function getPageConfig() {
    return { ...PAGE_CONFIG };
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// 导出到全局
window.IndexPage = {
    navigateTo,
    getCurrentPage,
    getPageConfig,
    retryLoad
};
