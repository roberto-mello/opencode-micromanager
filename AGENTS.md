# OpenCode Micromanager Plugin

## Project Overview

TypeScript plugin for OpenCode that intercepts the full LLM context (system prompt, message history, user message) before each request and opens it in an external editor for review and modification.

## Development Commands

```bash
opencode                      # Start OpenCode (plugin auto-loads)
bun run build                 # Build TypeScript plugin to .opencode/dist/
cd .opencode && bun install   # Install plugin dependencies
```

## Architecture

### Plugin Structure
- **Plugin Source**: `.opencode/plugins/message-interceptor.ts` (auto-loaded by OpenCode)
- **Configuration**: `.micromanager.jsonc` in project root (JSONC with comments supported)
- **Dependencies**: `.opencode/package.json` for `@opencode-ai/plugin`

### Plugin Hooks Used

- `experimental.chat.system.transform` -- captures the system prompt before LLM call
- `experimental.chat.messages.transform` -- captures full message history; opens editor here
- `chat.message` -- lightweight logging of incoming user messages
- `tool.execute.before` -- logs tool executions
- `event` -- tracks session lifecycle events

### Data Flow

1. User sends a message in OpenCode
2. `experimental.chat.system.transform` fires -- plugin stores the system prompt
3. `experimental.chat.messages.transform` fires -- plugin receives the full message array, formats everything into a markdown file, opens the editor
4. User reviews/edits and closes the editor
5. Plugin reads back the edited file, updates the last user message's text parts
6. OpenCode sends the (potentially modified) context to the LLM

## Coding Conventions

### TypeScript
- Use strict TypeScript with proper type annotations
- Import types from `@opencode-ai/plugin` for type safety
- Use `export const PluginName: Plugin = async (ctx) => {}` pattern

### Plugin Development
- Use `client.app.log()` for structured logging, not `console.log()`
- Handle errors gracefully with try-catch blocks
- Use `execSync` (not `spawn`) for editor invocation -- must block until editor closes

### File Organization
- Plugin source in `.opencode/plugins/`
- Plugin dependencies in `.opencode/package.json`
- Runtime config in `.micromanager.jsonc` at project root
- OpenCode app config in `.opencode/opencode.json`
