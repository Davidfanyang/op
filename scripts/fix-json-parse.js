const fs = require('fs');
const path = '/Users/adime/.openclaw/workspace/trainer-core/infrastructure/persistence/mysql/mysql-evaluation-repository.js';

let content = fs.readFileSync(path, 'utf8');

// 替换 JSON.parse 调用
content = content.replace(
  /row\.dimension_scores_json \? JSON\.parse\(row\.dimension_scores_json\) : \{\}/g,
  'parseJson(row.dimension_scores_json, {})'
);
content = content.replace(
  /row\.findings_json \? JSON\.parse\(row\.findings_json\) : \[\]/g,
  'parseJson(row.findings_json, [])'
);
content = content.replace(
  /row\.suggestions_json \? JSON\.parse\(row\.suggestions_json\) : \[\]/g,
  'parseJson(row.suggestions_json, [])'
);
content = content.replace(
  /row\.strengths_json \? JSON\.parse\(row\.strengths_json\) : \[\]/g,
  'parseJson(row.strengths_json, [])'
);
content = content.replace(
  /row\.alerts_json \? JSON\.parse\(row\.alerts_json\) : \[\]/g,
  'parseJson(row.alerts_json, [])'
);
content = content.replace(
  /row\.meta_json \? JSON\.parse\(row\.meta_json\) : \{\}/g,
  'parseJson(row.meta_json, {})'
);

// 添加 parseJson 函数
content = content.replace(
  /(_rowToObject\(row\) \{\n    if \(!row\) return null;\n)(\n    return)/,
  '$1    // MySQL 9.x + mysql2 驱动会自动解析 JSON 字段\n    const parseJson = (v, defaultValue) => {\n      if (!v) return defaultValue;\n      if (typeof v === \'object\') return v;\n      try { return JSON.parse(v); } catch { return defaultValue; }\n    };\n$2'
);

fs.writeFileSync(path, content);
console.log('Fixed mysql-evaluation-repository.js');
