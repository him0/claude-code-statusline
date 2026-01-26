# claude-code-statusline

Custom statusLine command for Claude Code.

## Features

- Working directory (`~` shortened)
- Git branch with dirty indicator (`*`) + clickable PR link
- Model name
- Session duration
- Token usage (input ↑ / output ↓ / total)
- Context window usage (used/total with percentage)

## Output Sample

```
~/src/my-project | main* [PR#42] | Opus 4.5 | 03:45 | ↑12.3k ↓5.6k (17.9k) | 45.2k/200k (22%)
```

| Part | Description |
|------|-------------|
| `~/src/my-project` | Working directory |
| `main*` | Git branch (`*` = uncommitted changes) |
| `[PR#42]` or `[Draft PR#42]` | Clickable link to open PR (shows Draft prefix for draft PRs) |
| `Opus 4.5` | Model name |
| `03:45` | Session duration (mm:ss) |
| `↑12.3k ↓5.6k (17.9k)` | Tokens: input ↑ / output ↓ / (total) |
| `45.2k/200k (22%)` | Context window usage |

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
  "command": "bunx him0/claude-code-statusline"
}
```

## Requirements

- Node.js 18+
- `gh` CLI (optional, for PR links)

## License

ISC
