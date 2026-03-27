const fs = require('fs');
const path = require('path');
const { evaluateTraining } = require('./core/trainer');

function main() {
  const inputFile = process.argv[2];

  if (!inputFile) {
    console.error('用法: node index.js <input-json-file>');
    process.exit(1);
  }

  const fullPath = path.resolve(process.cwd(), inputFile);
  const raw = fs.readFileSync(fullPath, 'utf8');
  const input = JSON.parse(raw);
  const output = evaluateTraining(input);
  console.log(JSON.stringify(output, null, 2));
}

main();
