/**
 * CLI 评估工具
 * 
 * 用法: node index.js <input-json-file>
 * 
 * 协议版本: v1.0（标准协议）
 * - 输入文件应使用标准协议格式
 * - 支持向后兼容旧字段格式
 */

const fs = require('fs');
const path = require('path');
const { evaluate } = require('./services/evaluation-service');

async function main() {
  const inputFile = process.argv[2];

  if (!inputFile) {
    console.error('用法: node index.js <input-json-file>');
    process.exit(1);
  }

  // 先尝试相对于 cwd 解析，再尝试相对于脚本目录解析
  let fullPath = path.resolve(process.cwd(), inputFile);
  if (!fs.existsSync(fullPath)) {
    fullPath = path.resolve(__dirname, inputFile);
  }

  // 检查文件是否存在
  if (!fs.existsSync(fullPath)) {
    console.error(`文件不存在: ${inputFile}`);
    process.exit(1);
  }

  let raw, input;
  try {
    raw = fs.readFileSync(fullPath, 'utf8');
    input = JSON.parse(raw);
  } catch (err) {
    console.error(`读取或解析文件失败: ${err.message}`);
    process.exit(1);
  }
  
  try {
    const output = await evaluate(input);
    console.log(JSON.stringify(output, null, 2));
  } catch (err) {
    console.error('评估失败:', err);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('运行时错误:', err);
  process.exit(1);
});
