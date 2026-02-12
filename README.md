# OpenCode Micromanager

An [OpenCode](https://opencode.ai) plugin that intercepts the full context being sent to the LLM before each request. Opens your editor so you can review the system prompt, message history, and current user message -- and optionally edit the message before it's sent.

## Install

Clone into any project directory:

```bash
git clone https://github.com/YOUR_USERNAME/opencode-micromanager.git
cd opencode-micromanager
```

Install plugin dependencies:

```bash
cd .opencode && bun install && cd ..
```

## Quick Start

1. Copy the example config to your project root:

```bash
cp .micromanager.jsonc .micromanager.jsonc
```

2. Set your editor (must support a "wait" flag):

```bash
export EDITOR='codium -w'   # or 'code -w', 'subl -w', 'zed --wait', etc.
```

3. Start OpenCode:

```bash
opencode
```

Send any message. Your editor will open with the full LLM context before the request is sent.

## How It Works

The plugin hooks into three OpenCode events that fire before each LLM request:

1. `experimental.chat.system.transform` -- captures the system prompt
2. `experimental.chat.messages.transform` -- captures the full message history and opens the editor
3. `tool.execute.before` -- logs tool executions

When the editor opens, you see:

- **System Prompt** -- all instructions, rules, and agent config being sent
- **Message History** -- every prior user/assistant turn, including tool calls and outputs
- **Current User Message** -- the new message (editable)

Edit the text below the last `(Current - Editable)` header, save, and close. The modified text is sent to the LLM.

## Configuration

Edit `.micromanager.jsonc` in your project root:

```jsonc
{
  "logLevel": "info",
  "enableEditor": true,
  "autoEdit": true,
  // Override the editor command (defaults to $EDITOR env var, then "nano")
  // "editor": "codium -w",
  "showSystemMessages": true,
  "messageTypes": ["user", "assistant"]
}
```

| Option | Default | Description |
|---|---|---|
| `logLevel` | `"info"` | Log verbosity: `debug`, `info`, `warn`, `error` |
| `enableEditor` | `true` | Enable the editor feature |
| `autoEdit` | `false` | Open editor automatically for every message |
| `editor` | `$EDITOR` or `"code -w"` | GUI editor command (must block until closed) |
| `showSystemMessages` | `true` | Include system prompt in editor view |
| `messageTypes` | `["user", "assistant"]` | Message types to intercept |

The plugin looks for `.micromanager.jsonc` first, then `.micromanager.json`. JSONC comments are supported.

## Project Structure

```
opencode-micromanager/
├── .micromanager.jsonc              # Plugin configuration
├── .opencode/
│   ├── plugins/
│   │   └── message-interceptor.ts   # Plugin source
│   ├── package.json                 # Plugin dependencies
│   └── opencode.json                # OpenCode project config
├── package.json
└── README.md
```

## Building

The plugin loads directly from `.opencode/plugins/` as TypeScript. No build step is required for normal use.

To type-check or produce a compiled JS output:

```bash
# Using bun (from project root)
bun run build

# Using tsc (from .opencode/)
cd .opencode && bun run build
```

## Editor Notes

OpenCode's TUI controls the terminal, so **terminal editors (vim, nano, etc.) will not work**. You must use a GUI editor with a "wait" flag that blocks until the file is closed.

| Editor | Command |
|---|---|
| VS Code | `code -w` |
| VSCodium | `codium -w` |
| Sublime Text | `subl -w` |
| Zed | `zed --wait` |

Set it via the `$EDITOR` environment variable or the `editor` field in `.micromanager.jsonc`.

## License

MIT
