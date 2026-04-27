#!/usr/bin/env node
/**
 * 第三步：反查 Telegram 历史正文来源
 * 
 * 目标：验证是否能通过 chat_id + 时间范围从 ChatExport 中匹配到历史消息正文
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// 数据库配置
const DB_CONFIG = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'trainer_core'
};

// ChatExport 路径
const CHAT_EXPORT_PATH = '/Users/adime/Downloads/Telegram Desktop/ChatExport_2026-04-04/result.json';

async function main() {
  console.log('='.repeat(80));
  console.log('第三步：Telegram 历史正文来源反查验证');
  console.log('='.repeat(80));

  // 1. 连接数据库
  const connection = await mysql.createConnection(DB_CONFIG);
  console.log('\n✓ 数据库连接成功');

  // 2. 随机抽取 5 条 historical_conversations 样本
  console.log('\n抽取 5 条历史会话样本...');
  const [samples] = await connection.query(`
    SELECT 
      id as historical_conversation_id,
      original_id,
      chat_id,
      user_id,
      start_time,
      end_time,
      message_count,
      agent_tag
    FROM historical_conversations
    ORDER BY RAND()
    LIMIT 5
  `);

  console.log(`\n样本清单：`);
  samples.forEach((s, idx) => {
    console.log(`  ${idx + 1}. id=${s.historical_conversation_id}, chat_id=${s.chat_id}, time=${s.start_time} ~ ${s.end_time}, messages=${s.message_count}`);
  });

  // 3. 加载 ChatExport 数据
  console.log('\n加载 ChatExport 数据...');
  if (!fs.existsSync(CHAT_EXPORT_PATH)) {
    console.error(`❌ ChatExport 文件不存在: ${CHAT_EXPORT_PATH}`);
    await connection.end();
    return;
  }

  const exportData = JSON.parse(fs.readFileSync(CHAT_EXPORT_PATH, 'utf8'));
  console.log(`✓ ChatExport 加载成功:`);
  console.log(`  - 群聊名称: ${exportData.name}`);
  console.log(`  - 群聊类型: ${exportData.type}`);
  console.log(`  - 群聊ID: ${exportData.id}`);
  console.log(`  - 消息总数: ${exportData.messages.length}`);

  // 4. 分析 ChatExport 的时间范围
  const dates = exportData.messages.map(m => new Date(m.date));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  console.log(`  - 时间范围: ${minDate.toISOString()} ~ ${maxDate.toISOString()}`);

  // 5. 逐条样本尝试匹配
  console.log('\n' + '='.repeat(80));
  console.log('开始匹配验证');
  console.log('='.repeat(80));

  const matchResults = [];

  for (const sample of samples) {
    console.log(`\n--- 样本 ${sample.historical_conversation_id} ---`);
    console.log(`  chat_id: ${sample.chat_id}`);
    console.log(`  时间范围: ${sample.start_time} ~ ${sample.end_time}`);
    console.log(`  消息数: ${sample.message_count}`);

    // 5.1 chat_id 匹配检查
    const chatIdMatch = sample.chat_id === exportData.id;
    console.log(`  chat_id 精确匹配: ${chatIdMatch ? '✓' : '✗'}`);
    console.log(`    样本 chat_id: ${sample.chat_id}`);
    console.log(`    导出 chat_id: ${exportData.id}`);

    // 5.2 时间范围匹配（±30分钟 buffer）
    const startTime = new Date(sample.start_time);
    const endTime = sample.end_time ? new Date(sample.end_time) : new Date();
    const bufferMs = 30 * 60 * 1000; // 30分钟

    const matchedMessages = exportData.messages.filter(m => {
      const msgDate = new Date(m.date);
      return msgDate >= new Date(startTime.getTime() - bufferMs) && 
             msgDate <= new Date(endTime.getTime() + bufferMs);
    });

    console.log(`  时间范围匹配 (±30min): ${matchedMessages.length} 条消息`);

    // 5.3 消息数匹配度
    const messageCountDiff = Math.abs(matchedMessages.length - sample.message_count);
    const messageCountMatchRate = sample.message_count > 0 
      ? ((1 - messageCountDiff / sample.message_count) * 100).toFixed(1)
      : 'N/A';
    console.log(`  消息数匹配度: ${matchedMessages.length}/${sample.message_count} (${messageCountMatchRate}%)`);

    // 5.4 如果匹配成功，展示前3条和后3条消息
    if (matchedMessages.length > 0 && matchedMessages.length <= sample.message_count * 1.5) {
      console.log(`  ✓ 匹配成功！`);
      console.log(`  前3条消息:`);
      matchedMessages.slice(0, 3).forEach((m, idx) => {
        const text = typeof m.text === 'string' ? m.text : m.text_entities?.map(e => e.text).join('') || '[复杂内容]';
        console.log(`    ${idx + 1}. [${m.date}] ${m.from}: ${text.substring(0, 50)}`);
      });
    } else {
      console.log(`  ✗ 匹配失败`);
    }

    matchResults.push({
      sample,
      chatIdMatch,
      matchedMessageCount: matchedMessages.length,
      messageCountMatchRate,
      success: chatIdMatch && matchedMessages.length > 0
    });
  }

  // 6. 统计匹配成功率
  console.log('\n' + '='.repeat(80));
  console.log('匹配统计');
  console.log('='.repeat(80));

  const successCount = matchResults.filter(r => r.success).length;
  const chatIdMatchCount = matchResults.filter(r => r.chatIdMatch).length;
  const timeMatchCount = matchResults.filter(r => r.matchedMessageCount > 0).length;

  console.log(`\nchat_id 精确匹配: ${chatIdMatchCount}/${samples.length} (${(chatIdMatchCount/samples.length*100).toFixed(1)}%)`);
  console.log(`时间范围匹配 (±30min): ${timeMatchCount}/${samples.length} (${(timeMatchCount/samples.length*100).toFixed(1)}%)`);
  console.log(`完全匹配成功: ${successCount}/${samples.length} (${(successCount/samples.length*100).toFixed(1)}%)`);

  // 7. 输出最终结论
  console.log('\n' + '='.repeat(80));
  console.log('最终结论');
  console.log('='.repeat(80));

  if (successCount === 0) {
    console.log('\n❌ 未找到可反查的正文来源，历史会话仍只能停留在元数据层');
    console.log('\n原因分析:');
    console.log('  1. ChatExport 是群聊数据 (id: 4732895991)');
    console.log('  2. historical_conversations 是私聊数据 (chat_id: 6839302099 等)');
    console.log('  3. 两者 chat_id 完全不匹配');
    console.log('  4. 缺少对应私聊的 ChatExport 导出');
    console.log('\n建议:');
    console.log('  - 需要从数据提供方获取私聊消息正文');
    console.log('  - 或通过 Telegram Bot API 根据 user_id + 时间范围反查私聊历史');
  } else if (successCount < 3) {
    console.log('\n⚠️ 找到候选正文来源，但匹配成功率不足，需补充更多源后再继续');
    console.log(`\n成功率: ${successCount}/${samples.length} (${(successCount/samples.length*100).toFixed(1)}%)`);
  } else {
    console.log('\n✅ 已找到可通过 chat_id + 时间范围 反查的真实正文来源，可进入第四步');
    console.log(`\n成功率: ${successCount}/${samples.length} (${(successCount/samples.length*100).toFixed(1)}%)`);
  }

  // 8. 清理
  await connection.end();
  console.log('\n✓ 数据库连接已关闭');
}

main().catch(err => {
  console.error('❌ 脚本执行失败:', err);
  process.exit(1);
});
