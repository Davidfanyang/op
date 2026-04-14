#!/usr/bin/env node
const mysql = require('mysql2/promise');

const pool = mysql.createPool({ 
  host: 'localhost', 
  user: 'root', 
  password: '', 
  database: 'pai_dashboard' 
});

(async () => {
  console.log('📝 插入3条 training 验收样例...\n');

  try {
    // 样例1: 高优先级 - 低分+态度问题
    console.log('【样例1】高优先级 - 态度问题 (emp_zhang)');
    await pool.query(`INSERT INTO sessions (session_id, project_id, channel, mode, employee_id, customer_id, status, started_at) VALUES ('sess_high_001', 'default', 'telegram', 'training', 'emp_zhang', 'cust_001', 'closed', NOW())`);
    await pool.query(`INSERT INTO messages (message_id, session_id, project_id, channel, sender_role, sender_id, message_direction, content, sent_at) VALUES ('msg_high_001', 'sess_high_001', 'default', 'telegram', 'agent', 'emp_zhang', 'outbound', '不知道,你等会吧', NOW())`);
    await pool.query(`INSERT INTO evaluations (evaluation_id, project_id, session_id, message_id, mode, scenario_id, status, evaluation_status, score, alert_level, findings_json, suggestions_json, coach_summary, review_status, created_at) VALUES ('eval_high_001', 'default', 'sess_high_001', 'msg_high_001', 'training', 'greeting_test', 'ok', 'completed', 18, 'critical', '[{"dimension":"服务态度","description":"客服态度敷衍,回复不负责任"},{"dimension":"专业度","description":"未提供任何有效解决方案"}]', '["立即改善服务态度","主动为客户提供解决方案"]', '客服态度严重问题,直接回复不知道,需立即辅导', 'pending', NOW())`);
    await pool.query(`INSERT INTO reviews (review_id, project_id, mode, session_id, message_id, evaluation_id, channel, employee_id, customer_id, alert_level, review_status, created_at) VALUES ('review_high_001', 'default', 'training', 'sess_high_001', 'msg_high_001', 'eval_high_001', 'telegram', 'emp_zhang', 'cust_001', 'critical', 'pending', NOW())`);
    console.log('  ✅ 插入成功: score=18, 态度问题\n');

    // 样例2: 中优先级 - 中分+话术问题
    console.log('【样例2】中优先级 - 话术问题 (emp_li)');
    await pool.query(`INSERT INTO sessions (session_id, project_id, channel, mode, employee_id, customer_id, status, started_at) VALUES ('sess_med_001', 'default', 'telegram', 'training', 'emp_li', 'cust_002', 'closed', NOW())`);
    await pool.query(`INSERT INTO messages (message_id, session_id, project_id, channel, sender_role, sender_id, message_direction, content, sent_at) VALUES ('msg_med_001', 'sess_med_001', 'default', 'telegram', 'agent', 'emp_li', 'outbound', '什么问题?', NOW())`);
    await pool.query(`INSERT INTO evaluations (evaluation_id, project_id, session_id, message_id, mode, scenario_id, status, evaluation_status, score, alert_level, findings_json, suggestions_json, coach_summary, review_status, created_at) VALUES ('eval_med_001', 'default', 'sess_med_001', 'msg_med_001', 'training', 'greeting_test', 'ok', 'completed', 42, 'warning', '[{"dimension":"礼貌程度","description":"回复过于简短,缺少礼貌用语"},{"dimension":"话术规范","description":"没有使用标准服务开场白"}]', '["使用礼貌开场白:您好,很高兴为您服务","主动询问客户需求"]', '话术不规范,但态度尚可', 'pending', NOW())`);
    await pool.query(`INSERT INTO reviews (review_id, project_id, mode, session_id, message_id, evaluation_id, channel, employee_id, customer_id, alert_level, review_status, created_at) VALUES ('review_med_001', 'default', 'training', 'sess_med_001', 'msg_med_001', 'eval_med_001', 'telegram', 'emp_li', 'cust_002', 'warning', 'pending', NOW())`);
    console.log('  ✅ 插入成功: score=42, 话术问题\n');

    // 样例3: 低优先级 - 轻度流程问题
    console.log('【样例3】低优先级 - 流程问题 (emp_wang)');
    await pool.query(`INSERT INTO sessions (session_id, project_id, channel, mode, employee_id, customer_id, status, started_at) VALUES ('sess_low_001', 'default', 'telegram', 'training', 'emp_wang', 'cust_003', 'closed', NOW())`);
    await pool.query(`INSERT INTO messages (message_id, session_id, project_id, channel, sender_role, sender_id, message_direction, content, sent_at) VALUES ('msg_low_001', 'sess_low_001', 'default', 'telegram', 'agent', 'emp_wang', 'outbound', '您好,请您提供一下订单号,我帮您查一下,可能需要等一下', NOW())`);
    await pool.query(`INSERT INTO evaluations (evaluation_id, project_id, session_id, message_id, mode, scenario_id, status, evaluation_status, score, alert_level, findings_json, suggestions_json, coach_summary, review_status, created_at) VALUES ('eval_low_001', 'default', 'sess_low_001', 'msg_low_001', 'training', 'transfer_query', 'ok', 'completed', 58, 'observation', '[{"dimension":"流程规范","description":"未按标准流程先安抚客户情绪"}]', '["先表达理解:非常理解您的着急","再按流程处理"]', '流程有小问题,但整体服务意识良好', 'pending', NOW())`);
    await pool.query(`INSERT INTO reviews (review_id, project_id, mode, session_id, message_id, evaluation_id, channel, employee_id, customer_id, alert_level, review_status, created_at) VALUES ('review_low_001', 'default', 'training', 'sess_low_001', 'msg_low_001', 'eval_low_001', 'telegram', 'emp_wang', 'cust_003', 'observation', 'pending', NOW())`);
    console.log('  ✅ 插入成功: score=58, 流程问题\n');

    console.log('✅ 3条验收样例全部插入成功!\n');
    console.log('现在运行: node scripts/show-training-workbench.js');

  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    await pool.end();
  }
})();
