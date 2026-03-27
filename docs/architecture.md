# Architecture

## Current Layers
- `bot/telegram-bot.js`: Telegram orchestrator (temporary main entry)
- `session/`: conversation state management
- `app/telegram/`: Telegram formatter + commands
- `adapters/telegram/`: Telegram HTTP adapter
- `core/`: trainer-core engine
- `data/`: scenarios and standards
- `runtime/`: logs and locks
- `scripts/`: experimental and smoke-test scripts

## Principles
1. One formal Telegram entry only
2. trainer-core stays platform-agnostic
3. Session state is separated from entry layer
4. Output formatting is separated from scoring logic
5. Runtime artifacts must stay out of root
