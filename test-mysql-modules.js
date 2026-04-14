/**
 * MySQL Repository 模块加载测试
 * 
 * 验证所有模块能正确加载（不连接数据库）
 */

const assert = require('assert');

console.log('='.repeat(60));
console.log('MySQL Repository 模块加载测试');
console.log('='.repeat(60));

// 测试1: 加载 MySQL Pool
console.log('\n[1] 测试 MySQL Pool 加载...');
try {
  const { MySQLPool, getPool, createPool } = require('./infrastructure/persistence/mysql/mysql-pool');
  assert(typeof MySQLPool === 'function');
  assert(typeof getPool === 'function');
  assert(typeof createPool === 'function');
  console.log('✓ MySQL Pool 模块加载成功');
} catch (err) {
  console.error('✗ MySQL Pool 加载失败:', err.message);
  process.exit(1);
}

// 测试2: 加载 MySQL Session Repository
console.log('\n[2] 测试 MySQL Session Repository 加载...');
try {
  const { MySQLSessionRepository } = require('./infrastructure/persistence/mysql/mysql-session-repository');
  assert(typeof MySQLSessionRepository === 'function');
  console.log('✓ MySQL Session Repository 模块加载成功');
} catch (err) {
  console.error('✗ MySQL Session Repository 加载失败:', err.message);
  process.exit(1);
}

// 测试3: 加载 MySQL Message Repository
console.log('\n[3] 测试 MySQL Message Repository 加载...');
try {
  const { MySQLMessageRepository } = require('./infrastructure/persistence/mysql/mysql-message-repository');
  assert(typeof MySQLMessageRepository === 'function');
  console.log('✓ MySQL Message Repository 模块加载成功');
} catch (err) {
  console.error('✗ MySQL Message Repository 加载失败:', err.message);
  process.exit(1);
}

// 测试4: 加载 MySQL Evaluation Repository
console.log('\n[4] 测试 MySQL Evaluation Repository 加载...');
try {
  const { MySQLEvaluationRepository } = require('./infrastructure/persistence/mysql/mysql-evaluation-repository');
  assert(typeof MySQLEvaluationRepository === 'function');
  console.log('✓ MySQL Evaluation Repository 模块加载成功');
} catch (err) {
  console.error('✗ MySQL Evaluation Repository 加载失败:', err.message);
  process.exit(1);
}

// 测试5: 加载 MySQL Review Repository
console.log('\n[5] 测试 MySQL Review Repository 加载...');
try {
  const { MySQLReviewRepository } = require('./infrastructure/persistence/mysql/mysql-review-repository');
  assert(typeof MySQLReviewRepository === 'function');
  console.log('✓ MySQL Review Repository 模块加载成功');
} catch (err) {
  console.error('✗ MySQL Review Repository 加载失败:', err.message);
  process.exit(1);
}

// 测试6: 加载 Repository Factory
console.log('\n[6] 测试 Repository Factory 加载...');
try {
  const { 
    RepositoryFactory, 
    createRepositoryFactory,
    MySQLSessionRepository,
    MySQLMessageRepository,
    MySQLEvaluationRepository,
    MySQLReviewRepository
  } = require('./repositories');
  
  assert(typeof RepositoryFactory === 'function');
  assert(typeof createRepositoryFactory === 'function');
  console.log('✓ Repository Factory 模块加载成功');
} catch (err) {
  console.error('✗ Repository Factory 加载失败:', err.message);
  process.exit(1);
}

// 测试7: 创建 File 驱动 Factory
console.log('\n[7] 测试创建 File 驱动 Factory...');
try {
  const { RepositoryFactory } = require('./repositories');
  const factory = new RepositoryFactory({ type: 'file' });
  assert(factory.config.type === 'file');
  console.log('✓ File 驱动 Factory 创建成功');
} catch (err) {
  console.error('✗ File 驱动 Factory 创建失败:', err.message);
  process.exit(1);
}

// 测试8: 创建 MySQL 驱动 Factory（不连接数据库）
console.log('\n[8] 测试创建 MySQL 驱动 Factory...');
try {
  const { RepositoryFactory } = require('./repositories');
  const factory = new RepositoryFactory({ 
    type: 'mysql',
    mysql: {
      host: 'localhost',
      database: 'test_db'
    }
  });
  assert(factory.config.type === 'mysql');
  assert(factory.config.mysql.host === 'localhost');
  console.log('✓ MySQL 驱动 Factory 创建成功');
} catch (err) {
  console.error('✗ MySQL 驱动 Factory 创建失败:', err.message);
  process.exit(1);
}

// 测试9: 测试 Repository 创建
console.log('\n[9] 测试 Repository 实例创建...');
try {
  const { RepositoryFactory } = require('./repositories');
  
  // File 驱动
  const fileFactory = new RepositoryFactory({ type: 'file' });
  const fileSessionRepo = fileFactory.getSessionRepository();
  assert(fileSessionRepo.constructor.name === 'FileSessionRepository');
  console.log('✓ File Session Repository 创建成功');
  
  // MySQL 驱动（不连接）
  const mysqlFactory = new RepositoryFactory({ type: 'mysql' });
  const mysqlSessionRepo = mysqlFactory.getSessionRepository();
  assert(mysqlSessionRepo.constructor.name === 'MySQLSessionRepository');
  console.log('✓ MySQL Session Repository 创建成功');
  
} catch (err) {
  console.error('✗ Repository 实例创建失败:', err.message);
  process.exit(1);
}

console.log('\n' + '='.repeat(60));
console.log('所有模块加载测试通过！');
console.log('='.repeat(60));
console.log('\n使用示例:');
console.log('---');
console.log('// File 驱动（开发/测试）');
console.log('const factory = createRepositoryFactory({ type: "file" });');
console.log('');
console.log('// MySQL 驱动（生产环境）');
console.log('const factory = createRepositoryFactory({');
console.log('  type: "mysql",');
console.log('  mysql: { host: "localhost", database: "trainer_core" }');
console.log('});');
console.log('await factory.initialize(); // 初始化连接');
console.log('---');
