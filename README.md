# claude-code-statusline

Custom statusLine command for Claude Code.

## Features

- Repository name with clickable remote link (falls back to working directory with `~` shortened)
- Git branch with dirty indicator (`*`), worktree prefix (`(wt)`), and clickable PR link
- Model name
- Context window usage (used/total with percentage)
- Session duration
- Token usage (input ↑ / output ↓ / total)

## Output Sample

```
claude-code-statusline | (wt) feature-branch* [PR#42] | Opus4.7 (1M) | 29.0k/1000k (3%) | 03:45 | ↑12.3k ↓5.6k (17.9k)
```

| Part | Description |
|------|-------------|
| `claude-code-statusline` | Repository name (clickable link to remote); falls back to `~/src/my-project` when not a git repo |
| `(wt)` | Shown when running inside a git worktree |
| `feature-branch*` | Git branch (`*` = uncommitted changes) |
| `[PR#42]` | Clickable link to open PR (if exists) |
| `Opus4.7 (1M)` | Model name |
| `29.0k/1000k (3%)` | Context window usage |
| `03:45` | Session duration (mm:ss) |
| `↑12.3k ↓5.6k (17.9k)` | Tokens: input ↑ / output ↓ / (total) |

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
