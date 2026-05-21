# claude-code-statusline

Custom statusLine command for Claude Code.

## Features

- Repository name with clickable remote link (falls back to working directory with `~` shortened)
- Git branch with dirty indicator (`*`), worktree prefix (`(wt)`), and clickable PR link
- Model name with abbreviated effort level (`low` / `med` / `hi` / `xhi` / `max`)
- Context window usage (used/total with `[%]`)
- Session duration as `api/wall` (subset/total ratio)
- Token usage (input ↑ / output ↓)
- Line diff for the session (`+added -removed`)
- Session cost in USD

## Output Sample

```
claude-code-statusline (wt) feature-branch* [PR#42] | Opus 4.7 xhi 29.0k/1M [3%] | 02:15/03:45 [↑12.3k ↓5.6k] [+35 -74] [$0.42]
```

| Part | Description |
|------|-------------|
| `claude-code-statusline` | Repository name (clickable link to remote); falls back to `~/src/my-project` when not a git repo |
| `(wt)` | Shown when running inside a git worktree |
| `feature-branch*` | Git branch (`*` = uncommitted changes) |
| `[PR#42]` | Clickable link to open PR (if exists) |
| `Opus 4.7` | Model name |
| `xhi` | Abbreviated effort level |
| `29.0k/1M` | Context window: used / total |
| `[3%]` | Context window usage percentage |
| `02:15/03:45` | Duration: API time / wall time (api ≤ wall) |
| `[↑12.3k ↓5.6k]` | Tokens: input ↑ / output ↓ |
| `[+35 -74]` | Lines added / removed during the session |
| `[$0.42]` | Cumulative session cost (USD) |

The line is split into three groups separated by ` | `: location (repo + branch), model state (model + context), and session cost (duration + tokens + lines + cost).

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
- `gh` CLI (optional, used to display clickable PR links)

## License

ISC
