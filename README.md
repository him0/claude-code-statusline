# claude-code-statusline

Custom statusLine command for Claude Code.

## Features

- Repository name with clickable remote link (falls back to working directory with `~` shortened)
- Git branch with dirty indicator (`*`), worktree prefix (`(wt)`), and clickable PR link (`#42`)
- Long branch names are middle-truncated at 25 characters (e.g. `remotes/orig…hing-hamster`)
- Line diff for the session (`+added -removed`) inline next to the branch; hidden when both are zero
- Model name with abbreviated effort level (`low` / `med` / `hi` / `xhi` / `max`)
- Context window usage (used/total with `[%]`)
- Session duration as `api/wall` (subset/total ratio); auto-extends to `H:MM:SS` past one hour
- Token usage (input ↑ / output ↓)
- Session cost in USD
- Optional `--pr-title` mode: show the PR title on a 2nd line as `<title> #<number>` (whole line clickable)

## Output Sample

```
claude-code-statusline (wt) feature-branch* #42 +35 -74 | Opus 4.7 xhi 29.0k/1M [3%] | 02:15/03:45 [↑12.3k ↓5.6k] [$0.42]
```

| Part | Description |
|------|-------------|
| `claude-code-statusline` | Repository name (clickable link to remote); falls back to `~/src/my-project` when not a git repo |
| `(wt)` | Shown when running inside a git worktree |
| `feature-branch*` | Git branch (`*` = uncommitted changes); names longer than 25 chars are middle-truncated (e.g. `remotes/orig…hing-hamster`) |
| `#42` | Clickable link to open PR (if exists) |
| `+35 -74` | Lines added / removed during the session; omitted entirely when both are 0 |
| `Opus 4.7` | Model name |
| `xhi` | Abbreviated effort level |
| `29.0k/1M` | Context window: used / total |
| `[3%]` | Context window usage percentage |
| `02:15/03:45` | Duration: API time / wall time (api ≤ wall); becomes `H:MM:SS` once a side exceeds one hour (e.g. `03:58/54:27:31`) |
| `[↑12.3k ↓5.6k]` | Tokens: input ↑ / output ↓ |
| `[$0.42]` | Cumulative session cost (USD) |

The line is split into three groups separated by ` | `: location (repo + branch + line diff), model state (model + context), and session metrics (duration + tokens + cost).

### PR Title (optional)

Pass `--pr-title` to show the PR title on a 2nd line and suppress the inline `#N` next to the branch:

```
claude-code-statusline (wt) feature-branch* +35 -74 | Opus 4.7 xhi 29.0k/1M [3%] | 02:15/03:45 [↑12.3k ↓5.6k] [$0.42]
[DEMO-5019] Add a date range field to the access-data filter modal #5348
```

The whole 2nd line is a clickable link that opens the PR. Requires `gh` CLI to be authenticated. When the current branch has no open PR, the 2nd line is omitted.

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

To enable the PR title on the 2nd line, append `--pr-title`:

```json
"statusLine": {
  "type": "command",
  "command": "npx him0/claude-code-statusline --pr-title"
}
```

## Requirements

- Node.js 18+
- `gh` CLI (optional, used to display clickable PR links)

## License

ISC
