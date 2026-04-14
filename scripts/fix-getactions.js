const fs = require('fs');
let content = fs.readFileSync('/Users/adime/.openclaw/workspace/trainer-core/infrastructure/persistence/mysql/mysql-review-repository.js', 'utf8');

// 替换 getActions 方法中的 LIMIT ? OFFSET ?
const oldPattern = `    // 分页查询
    const offset = (pagination.page - 1) * pagination.limit;
    const sql = \`
      SELECT * FROM review_actions 
      WHERE review_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    \`;
    
    const rows = await this.pool.queryMany(sql, [reviewId, pagination.limit, offset]);`;

const newPattern = `    // 分页查询
    const limit = parseInt(pagination.limit) || 20;
    const offset = (pagination.page - 1) * limit;
    const sql = \`
      SELECT * FROM review_actions 
      WHERE review_id = ?
      ORDER BY created_at DESC
      LIMIT \${limit} OFFSET \${offset}
    \`;
    
    const rows = await this.pool.queryMany(sql, [reviewId]);`;

if (content.includes(oldPattern)) {
  content = content.replace(oldPattern, newPattern);
  fs.writeFileSync('/Users/adime/.openclaw/workspace/trainer-core/infrastructure/persistence/mysql/mysql-review-repository.js', content);
  console.log('Fixed getActions method');
} else {
  console.log('Pattern not found - may already be fixed or different format');
  // 检查是否有 LIMIT ? OFFSET ?
  if (content.includes('LIMIT ? OFFSET ?')) {
    console.log('Still has LIMIT ? OFFSET ? in file');
  }
}
