const fs = require('fs');
const path = require('path');

const files = [
  '/Users/adime/.openclaw/workspace/trainer-core/infrastructure/persistence/mysql/mysql-evaluation-repository.js',
  '/Users/adime/.openclaw/workspace/trainer-core/infrastructure/persistence/mysql/mysql-message-repository.js',
  '/Users/adime/.openclaw/workspace/trainer-core/infrastructure/persistence/mysql/mysql-review-repository.js',
  '/Users/adime/.openclaw/workspace/trainer-core/infrastructure/persistence/mysql/mysql-session-repository.js'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // 替换 LIMIT ? OFFSET ? 为模板字符串形式
  // 需要同时修改调用方式
  // 原始: LIMIT ? OFFSET ? ... [...params, pagination.limit, offset]
  // 修改: LIMIT ${pagination.limit} OFFSET ${offset} ... params
  
  // 方案：将所有分页查询改成使用模板字符串拼接 limit 和 offset
  // 这是一个更安全的修复方式
  
  // 匹配模式：
  // ORDER BY xxx DESC
  // LIMIT ? OFFSET ?
  // `;
  // const rows = await this.pool.queryMany(sql, [...params, pagination.limit, offset]);
  
  // 替换为：
  // ORDER BY xxx DESC
  // LIMIT ${limit} OFFSET ${offset}
  // `;
  // const rows = await this.pool.queryMany(sql, params);
  
  // 先标记需要修复的位置
  
  content = content.replace(
    /const offset = \(pagination\.page - 1\) \* pagination\.limit;\s*\n\s*const sql = `([^`]+)LIMIT \? OFFSET \?([^`]+)`;\s*\n\s*const rows = await this\.pool\.queryMany\(sql, \[\.\.\.params, pagination\.limit, offset\]\);/g,
    (match, before, after) => {
      return `const limit = parseInt(pagination.limit) || 20;
    const offset = (pagination.page - 1) * limit;
    const sql = \`${before}LIMIT \${limit} OFFSET \${offset}\${after}\`;
    
    const rows = await this.pool.queryMany(sql, params);`;
    }
  );
  
  fs.writeFileSync(file, content);
  console.log(`Fixed: ${path.basename(file)}`);
}

console.log('Done');
