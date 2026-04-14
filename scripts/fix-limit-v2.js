const fs = require('fs');

// 先修复 mysql-review-repository.js 中的 findPending 方法
const reviewPath = '/Users/adime/.openclaw/workspace/trainer-core/infrastructure/persistence/mysql/mysql-review-repository.js';
let reviewContent = fs.readFileSync(reviewPath, 'utf8');

// 修复 findPending 方法 (第196-203行)
reviewContent = reviewContent.replace(
  /const offset = \(pagination\.page - 1\) \* pagination\.limit;\s*
\s*const sql = `\s*
\s*SELECT \* FROM reviews\s*
\s*WHERE \$\{conditions\.join\(' AND '\)\}\s*
\s*ORDER BY created_at DESC\s*
\s*LIMIT \? OFFSET \?\s*
\s*`;\s*
\s*const rows = await this\.pool\.queryMany\(sql, \[\.\.\.params, pagination\.limit, offset\]\);/,
  `const limit = parseInt(pagination.limit) || 20;
    const offset = (pagination.page - 1) * limit;
    const sql = \`
      SELECT * FROM reviews 
      WHERE \${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT \${limit} OFFSET \${offset}
    \`;
    
    const rows = await this.pool.queryMany(sql, params);`
);

// 修复 findMany 方法 (第248-255行)
reviewContent = reviewContent.replace(
  /const offset = \(pagination\.page - 1\) \* pagination\.limit;\s*
\s*const sql = `\s*
\s*SELECT \* FROM reviews \$\{whereClause\}\s*
\s*ORDER BY reviewed_at DESC, created_at DESC\s*
\s*LIMIT \? OFFSET \?\s*
\s*`;\s*
\s*const rows = await this\.pool\.queryMany\(sql, \[\.\.\.params, pagination\.limit, offset\]\);/,
  `const limit = parseInt(pagination.limit) || 20;
    const offset = (pagination.page - 1) * limit;
    const sql = \`
      SELECT * FROM reviews \${whereClause}
      ORDER BY reviewed_at DESC, created_at DESC
      LIMIT \${limit} OFFSET \${offset}
    \`;
    
    const rows = await this.pool.queryMany(sql, params);`
);

fs.writeFileSync(reviewPath, reviewContent);
console.log('Fixed mysql-review-repository.js');
