# claude-code-statusline

Custom statusLine command for Claude Code.

## Features

- Working directory
- Git branch (with dirty indicator `*`) + PR link
- Model name
- Session duration
- Token usage (input/output/total)
- Context window usage

## Install

```bash
npm install -g @him0/claude-code-statusline
```

## Setup

Add to `~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "npx him0/claude-code-statusline"
}
```

Or with Bun:

```json
"statusLine": {
  "type": "command",
  "command": "bun x him0/claude-code-statusline"
}
```

## License

ISC
