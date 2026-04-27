/**
 * 检查重复知识
 * 
 * 功能：
 * 1. 查询所有场景的知识条数
 * 2. 输出同场景多条知识的列表
 * 3. 提供处理建议
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkDuplicateKnowledge() {
  console.log('='.repeat(80));
  console.log('重复知识检查报告');
  console.log('='.repeat(80));

  // 连接数据库
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'trainer_core'
  });

  try {
    // 1. 查询所有场景的知识条数
    console.log('\n【1. 所有场景知识统计】');
    const [scenarioStats] = await connection.query(`
      SELECT 
        scenario, 
        COUNT(*) as count, 
        GROUP_CONCAT(DISTINCT status) as statuses
      FROM knowledge_base 
      GROUP BY scenario 
      ORDER BY count DESC
    `);

    console.log('\n场景名称'.padEnd(45) + '知识条数'.padEnd(12) + '状态');
    console.log('-'.repeat(80));
    scenarioStats.forEach(stat => {
      console.log(stat.scenario.padEnd(45) + String(stat.count).padEnd(12) + stat.statuses);
    });

    // 2. 查询同场景多条知识（active 状态）
    console.log('\n\n【2. 同场景多条知识（active 状态）】');
    const [duplicates] = await connection.query(`
      SELECT 
        scenario, 
        COUNT(*) as count
      FROM knowledge_base 
      WHERE status = 'active'
      GROUP BY scenario 
      HAVING count > 1 
      ORDER BY count DESC
    `);

    if (duplicates.length === 0) {
      console.log('\n✅ 未发现同场景多条 active 知识');
    } else {
      console.log('\n场景名称'.padEnd(45) + '知识条数'.padEnd(12) + '建议');
      console.log('-'.repeat(80));
      duplicates.forEach(dup => {
        let suggestion = '';
        if (dup.scenario.includes('test') || dup.scenario.includes('测试')) {
          suggestion = '测试场景，建议清理';
        } else if (dup.scenario === 'transfer_not_received') {
          suggestion = '可能与 lanton_transfer_success_not_received 重复，建议检查';
        } else {
          suggestion = '建议检查是否有重复知识';
        }
        console.log(dup.scenario.padEnd(45) + String(dup.count).padEnd(12) + suggestion);
      });
    }

    // 3. 查询具体重复知识详情
    console.log('\n\n【3. 重复知识详情（前 5 个场景）】');
    for (const dup of duplicates.slice(0, 5)) {
      console.log(`\n场景：${dup.scenario}（${dup.count} 条）`);
      console.log('-'.repeat(80));

      const [knowledgeList] = await connection.query(`
        SELECT 
          id,
          knowledge_id,
          LEFT(question_aliases, 100) as question,
          status,
          created_at
        FROM knowledge_base 
        WHERE scenario = ? AND status = 'active'
        ORDER BY created_at DESC
      `, [dup.scenario]);

      knowledgeList.forEach((kb, index) => {
        console.log(`${index + 1}. [${kb.knowledge_id}] ${kb.question} (${kb.status}, ${kb.created_at})`);
      });
    }

    // 4. 总结和建议
    console.log('\n\n【4. 总结和建议】');
    console.log('-'.repeat(80));

    const activeScenarios = scenarioStats.filter(s => s.statuses.includes('active'));
    const duplicateScenarios = duplicates.length;

    console.log(`\n- 总场景数：${scenarioStats.length}`);
    console.log(`- 有 active 知识的场景数：${activeScenarios.length}`);
    console.log(`- 同场景多条知识的场景数：${duplicateScenarios}`);

    if (duplicateScenarios > 0) {
      console.log(`\n⚠️ 发现 ${duplicateScenarios} 个场景存在重复知识`);
      console.log('\n建议处理顺序：');
      console.log('1. 优先处理 transfer_not_received（可能与白名单场景重复）');
      console.log('2. 清理测试场景（test、same_scenario、测试场景）');
      console.log('3. 检查其他场景的知识质量');
    } else {
      console.log('\n✅ 未发现重复知识，知识治理良好');
    }

  } catch (error) {
    console.error('❌ 检查失败:', error.message);
    console.error(error.stack);
  } finally {
    await connection.end();
  }
}

// 执行
checkDuplicateKnowledge().catch(error => {
  console.error('脚本执行失败:', error.message);
  process.exit(1);
});
