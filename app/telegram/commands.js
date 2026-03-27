function parseCommand(text) {
  const normalized = String(text || '').trim();
  if (['/start', '开始'].includes(normalized)) return 'start';
  if (['/score', '继续', '再来一题'].includes(normalized)) return 'score';
  if (['/cancel', '取消'].includes(normalized)) return 'cancel';
  return null;
}

module.exports = { parseCommand };
