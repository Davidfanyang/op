#!/usr/bin/env node
const { TrainingWorkbench } = require('../core/training-workbench');
const wb = new TrainingWorkbench();

(async () => {
  console.log('=== Training Queue 最小工作台 ===\n');
  
  try {
    // 1. 工作队列
    const queue = await wb.getWorkQueue('default');
    console.log('【工作队列 - 按优先级排序】');
    console.log('员工          场景              分数   优先级  问题标签          建议动作');
    console.log('-'.repeat(100));
    
    if (queue.length === 0) {
      console.log('✅ 当前没有待处理的 training 记录');
    } else {
      queue.forEach(item => {
        const emp = (item.employee_id || 'N/A').padEnd(12, ' ');
        const scenario = (item.scenario_id || 'N/A').padEnd(16, ' ');
        const score = (item.score !== null ? item.score.toFixed(1) : 'N/A').padEnd(6, ' ');
        const priority = (item.priority || 'medium').padEnd(7, ' ');
        const tags = (item.problem_tags.join(',') || 'N/A').padEnd(16, ' ');
        console.log(`${emp} ${scenario} ${score} ${priority} ${tags} ${item.suggested_action}`);
      });
    }
    console.log();
    
    // 2. 员工汇总
    const employees = await wb.getEmployeeSummary('default');
    console.log('【员工维度汇总 - 主管先看谁】');
    console.log('员工          待处理  平均分  高优  中优  低优  处理建议');
    console.log('-'.repeat(100));
    
    if (employees.length === 0) {
      console.log('✅ 没有员工有待处理记录');
    } else {
      employees.forEach(emp => {
        const id = (emp.employee_id || 'N/A').padEnd(12, ' ');
        const score = (emp.avg_score !== null ? emp.avg_score.toFixed(1) : 'N/A').padEnd(6, ' ');
        console.log(`${id} ${String(emp.total_pending).padEnd(6, ' ')} ${score} ${emp.priority_distribution.high}    ${emp.priority_distribution.medium}    ${emp.priority_distribution.low}   ${emp.action_hint}`);
      });
    }
    console.log();
    
    // 3. 场景汇总
    const scenarios = await wb.getScenarioSummary('default');
    console.log('【场景维度汇总 - 哪些场景最难】');
    console.log('场景              待处理  平均分  失败数  难度提示');
    console.log('-'.repeat(80));
    
    if (scenarios.length === 0) {
      console.log('✅ 没有场景有待处理记录');
    } else {
      scenarios.forEach(s => {
        const scenario = (s.scenario_id || 'N/A').padEnd(16, ' ');
        const score = (s.avg_score !== null ? s.avg_score.toFixed(1) : 'N/A').padEnd(6, ' ');
        console.log(`${scenario} ${String(s.total_pending).padEnd(6, ' ')} ${score} ${s.fail_count}    ${s.difficulty_hint}`);
      });
    }
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    await wb.close();
  }
})();
