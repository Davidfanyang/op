const fs = require('fs');
const path = require('path');

// 项目配置
const PROJECT_CONFIG = {
  default: { name: '默认项目', filter: null },
  lanton: { name: 'LantonPay', filter: (s) => s.id.startsWith('lanton_') || s.id === 'register_flow' },
  pai: { name: 'Pai', filter: (s) => s.id.startsWith('pai_') }
};

// 缓存场景数据
let scenariosCache = null;

/**
 * 加载所有场景(支持新旧两种格式)
 */
function loadAllScenarios() {
  if (scenariosCache) {
    return scenariosCache;
  }

  const scenarios = [];

  // 1. 优先加载新格式 scenarios/index.json + 分文件
  const indexFilePath = path.join(__dirname, '..', 'data', 'scenarios', 'index.json');
  if (fs.existsSync(indexFilePath)) {
    const indexData = JSON.parse(fs.readFileSync(indexFilePath, 'utf8'));
    
    for (const item of indexData) {
      try {
        const scenarioPath = path.join(__dirname, '..', 'data', 'scenarios', item.path);
        if (fs.existsSync(scenarioPath)) {
          const scenarioData = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
          scenarios.push(scenarioData);
        }
      } catch (err) {
        console.warn(`[ScenarioLoader] 加载场景 ${item.id} 失败:`, err.message);
      }
    }
  }

  // 2. 加载旧格式 scenarios.json (暂时禁用，因编码问题)
  // TODO: 修复 scenarios.json 编码后重新启用
  /*
  const oldScenariosPath = path.join(__dirname, '..', 'data', 'scenarios.json');
  if (fs.existsSync(oldScenariosPath)) {
    try {
      const oldScenarios = JSON.parse(fs.readFileSync(oldScenariosPath, 'utf8'));
      // 只添加不在新格式中的场景
      const newIds = new Set(scenarios.map(s => s.id));
      oldScenarios.forEach(s => {
        if (!newIds.has(s.id)) {
          scenarios.push(s);
        }
      });
    } catch (err) {
      console.warn('[ScenarioLoader] 加载 scenarios.json 失败，暂时跳过:', err.message);
    }
  }
  */

  scenariosCache = scenarios;
  return scenarios;
}

/**
 * 根据ID获取场景
 */
function getScenarioById(id) {
  const scenarios = loadAllScenarios();
  return scenarios.find((item) => item.id === id) || null;
}

/**
 * 根据项目获取场景列表
 * @param {string} projectId - 项目ID (default | lanton | pai)
 * @returns {Array} 场景列表
 */
function getScenariosByProject(projectId = 'default') {
  const scenarios = loadAllScenarios();
  const config = PROJECT_CONFIG[projectId] || PROJECT_CONFIG.default;
  
  if (!config.filter) {
    return scenarios;
  }
  
  return scenarios.filter(config.filter);
}

/**
 * 获取项目列表
 */
function getProjects() {
  return Object.keys(PROJECT_CONFIG).map(key => ({
    id: key,
    name: PROJECT_CONFIG[key].name
  }));
}

/**
 * 自动匹配场景（用于 live_monitor 模式）
 * @param {string} customerMessage - 客户消息
 * @param {string} projectId - 项目ID
 * @returns {Object} 匹配结果 { scenario, confidence, matchType }
 */
function matchScenario(customerMessage, projectId = 'default') {
  const projectScenarios = getScenariosByProject(projectId);
  
  if (!customerMessage || projectScenarios.length === 0) {
    return { scenario: null, confidence: 0, matchType: 'none' };
  }
  
  const message = customerMessage.toLowerCase();
  let bestMatch = null;
  let bestScore = 0;
  let secondBestScore = 0;
  
  // 计算每个场景的匹配分数
  for (const scenario of projectScenarios) {
    const keywords = extractKeywords(scenario.customerMessage);
    const matchCount = keywords.filter(kw => message.includes(kw)).length;
    const score = matchCount / keywords.length;
    
    if (score > bestScore) {
      secondBestScore = bestScore;
      bestScore = score;
      bestMatch = scenario;
    } else if (score > secondBestScore) {
      secondBestScore = score;
    }
  }
  
  // 计算置信度
  let confidence = 0;
  let matchType = 'none';
  
  if (bestScore >= 0.8) {
    confidence = bestScore;
    matchType = 'exact';
  } else if (bestScore >= 0.5) {
    const gap = bestScore - secondBestScore;
    if (gap >= 0.3) {
      confidence = bestScore * 0.8;
      matchType = 'partial';
    } else {
      confidence = bestScore * 0.5;
      matchType = 'uncertain';
    }
  } else if (bestScore > 0) {
    confidence = bestScore * 0.3;
    matchType = 'low';
  }
  
  if (confidence < 0.05) {
    return { 
      scenario: bestMatch, 
      confidence, 
      matchType: 'low_confidence',
      warning: '匹配置信度低，建议人工确认'
    };
  }
  
  return { scenario: bestMatch, confidence, matchType };
}

/**
 * 提取关键词
 */
function extractKeywords(text) {
  const stopWords = new Set(['怎么', '什么', '为什么', '如何', '哪里', '哪个', '多少', '吗', '呢', '啊', '吧', '我', '你', '他', '她', '它', '我们', '你们', '他们', '的', '了', '在', '是', '有', '和', '与', '或', '但', '而', '就', '都', '要', '会', '能', '可以', '请', '帮', '一下', '一直', '怎么办']);
  
  const cleaned = text.toLowerCase().replace(/[？?。.,!！]/g, ' ');
  
  const chineseWords = [];
  const chinesePattern = /[\u4e00-\u9fa5]{2,6}/g;
  let match;
  while ((match = chinesePattern.exec(cleaned)) !== null) {
    if (!stopWords.has(match[0])) {
      chineseWords.push(match[0]);
    }
  }
  
  const spaceWords = cleaned
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopWords.has(w) && !/[\u4e00-\u9fa5]/.test(w));
  
  const allWords = [...new Set([...chineseWords, ...spaceWords])];
  
  return allWords.slice(0, 10);
}

module.exports = { 
  getScenarioById, 
  getScenariosByProject, 
  getProjects,
  matchScenario,
  loadAllScenarios // 导出以便刷新缓存
};

