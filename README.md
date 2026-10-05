# claude-code-statusline

Custom statusLine command for Claude Code.

## Features

- Repository name with clickable remote link (falls back to working directory with `~` shortened)
- Git branch with dirty indicator (`*`), worktree prefix (`(wt)`), and clickable PR link (`#42`)
- Long branch names are middle-truncated at 25 characters (e.g. `remotes/orig…hing-hamster`)
- Line diff for the session (`+added -removed`) inline next to the branch; hidden when both are zero
- Model name with abbreviated effort level (`low` / `med` / `hi` / `xhi` / `max`)
- Context window usage (used/total with `[%]`)
- Prompt cache time remaining (`cache 42m`, or `cache cold` once the TTL has passed)
- Session duration as `api/wall` (subset/total ratio); auto-extends to `H:MM:SS` past one hour
- Token usage (input ↑ / output ↓)
- Session cost in USD
- Claude Code service health: when the [status page](https://status.claude.com) reports the **Claude Code** component as degraded, a clickable status label appears at the end of the line (hidden while operational)
- Width-aware wrapping: when the terminal is too narrow, the line wraps at group boundaries (the ` | ` separators) so each group stays intact
- Optional `--pr-title` mode: show the PR title on a 2nd line as `<title> #<number>` (whole line clickable)

## Output Sample

```
claude-code-statusline (wt) feature-branch* #42 +35 -74 | Fable 5 xhi 29.0k/1M [3%] cache 42m | 02:15/03:45 [↑12.3k ↓5.6k] [$0.42]
```

| Part | Description |
|------|-------------|
| `claude-code-statusline` | Repository name (clickable link to remote); falls back to `~/src/my-project` when not a git repo |
| `(wt)` | Shown when running inside a git worktree |
| `feature-branch*` | Git branch (`*` = uncommitted changes); names longer than 25 chars are middle-truncated (e.g. `remotes/orig…hing-hamster`) |
| `#42` | Clickable link to open PR (if exists) |
| `+35 -74` | Lines added / removed during the session; omitted entirely when both are 0 |
| `Fable 5` | Model name |
| `xhi` | Abbreviated effort level |
| `29.0k/1M` | Context window: used / total |
| `[3%]` | Context window usage percentage |
| `cache 42m` | Minutes until the prompt cache expires (rounded up); `cache cold` once expired; hidden until the first API response reports cache usage (requires Claude Code v2.1.251+) |
| `02:15/03:45` | Duration: API time / wall time (api ≤ wall); becomes `H:MM:SS` once a side exceeds one hour (e.g. `03:58/54:27:31`) |
| `[↑12.3k ↓5.6k]` | Tokens: input ↑ / output ↓ |
| `[$0.42]` | Cumulative session cost (USD) |

The line is split into three groups separated by ` | `: location (repo + branch + line diff), model state (model + context + prompt cache), and session metrics (duration + tokens + cost). A fourth group (the status warning below) is appended only when Claude Code is unhealthy.

### Width-aware wrapping

When the rendered line is wider than the terminal, it wraps at group boundaries (the ` | ` separators) so each group stays on a single line — a meaningful break point rather than an arbitrary mid-word cut:

```
claude-code-statusline feature-branch* +35 -74
Fable 5 xhi 29.0k/1M [3%]
02:15/03:45 [↑12.3k ↓5.6k] [$0.42]
```

The terminal width is read from the `COLUMNS` environment variable, which Claude Code sets to the current terminal dimensions before running the status line (requires Claude Code v2.1.153 or later). Hyperlink (OSC 8) and ANSI escape sequences are excluded from the width calculation, so a clickable repo or PR link is measured by its visible text, not its URL. When `COLUMNS` is unavailable, the line is never wrapped and renders on a single line as before. A group that is wider than the terminal on its own is left intact (it cannot be split further).

### Claude Code status warning

When the [Claude status page](https://status.claude.com) reports the **Claude Code** component as anything other than operational, a clickable label is appended as a final group:

```
claude-code-statusline feature-branch* | Fable 5 xhi 29.0k/1M [3%] cache 42m | 02:15/03:45 [↑12.3k ↓5.6k] [$0.42] | Partial Outage
```

| Component status | Shown label |
|------------------|-------------|
| `operational` | *(hidden)* |
| `under_maintenance` | *(hidden — planned maintenance is ignored)* |
| `degraded_performance` | `Degraded` |
| `partial_outage` | `Partial Outage` |
| `major_outage` | `Major Outage` |

The label links to <https://status.claude.com>. The status is fetched in the background (never blocking the status line render) and cached for 60 seconds, so it costs at most one tiny request per minute. Only the dedicated **Claude Code** component is monitored, so outages of other services (claude.ai, the API, etc.) do not trigger it.

Tune or disable it with environment variables:

- `STATUSLINE_STATUS_CACHE_TTL_MS` — refresh interval in ms (default `60000`)
- `STATUSLINE_STATUS_DISABLE=1` — turn the status check off entirely

### PR Title (optional)

Pass `--pr-title` to show the PR title on a 2nd line and suppress the inline `#N` next to the branch:

```
claude-code-statusline (wt) feature-branch* +35 -74 | Fable 5 xhi 29.0k/1M [3%] cache 42m | 02:15/03:45 [↑12.3k ↓5.6k] [$0.42]
[DEMO-5019] Add a date range field to the access-data filter modal #5348
```

The whole 2nd line is a clickable link that opens the PR. Requires `gh` CLI to be authenticated. When the current branch has no open PR, the 2nd line is omitted.

### PR lookup cache

The PR number and title come from `gh pr view`, which costs one GitHub GraphQL request (~0.5s) per call. The status line re-renders on every conversation update, so the result is cached in `~/.claude/cache/statusline-pr-cache.json`, keyed by directory and invalidated when the branch changes:

| Result | Cached for | Why |
|--------|-----------|-----|
| An open PR was found | 5 minutes | The title rarely changes mid-session |
| No PR / not open / `gh` failed | 1 minute | A newly created PR should still appear quickly |

Caching the *misses* matters most: without it, every render on a branch with no PR (`main` included) fires its own API request — hundreds per hour of active work, each blocking the render for half a second.

Stale entries are swept on every cache write. An entry is dropped when its directory no longer exists (a git worktree that has been removed), or when it has not been refreshed for 30 days. Dropping an entry is cheap: the next render in that directory simply looks the PR up again and re-caches it, so the sweep only ever costs one extra `gh` call on a directory you come back to.

Tune the TTLs with environment variables:

- `STATUSLINE_PR_CACHE_TTL_MS` — how long a found PR is cached, in ms (default `300000`)
- `STATUSLINE_PR_NEGATIVE_CACHE_TTL_MS` — how long a miss is cached, in ms (default `60000`)

## Install

```bash
npm install -g @him0/claude-code-statusline
```

## Setup

Add to `~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "npx him0/claude-code-statusline",
  "refreshInterval": 60
}
```

`refreshInterval` (seconds) re-runs the command periodically in addition to Claude Code's event-driven updates, so the `cache 42m` countdown keeps ticking while the session is idle. It is optional: without it the line still switches to `cache cold` when the cache expires (Claude Code re-renders at `prompt_cache.expires_at`), but the minutes in between only update on new messages.

When `prompt_cache` is reported but no `statusLine.refreshInterval` of `1` or more is found, a hint is printed on its own last line:

```
claude-code-statusline feature-branch* | Fable 5 xhi 29.0k/1M [3%] cache 42m | 02:15/03:45 [↑12.3k ↓5.6k] [$0.42]
⚠ set "refreshInterval": 60 in statusLine settings to keep the cache countdown live
```

Any value of `1` or more counts (it does not have to be `60`). The check reads `~/.claude/settings.json`, `<project>/.claude/settings.json`, and `<project>/.claude/settings.local.json`; managed settings and `--settings` are not visible to it, so set `STATUSLINE_REFRESH_HINT_DISABLE=1` to hide the hint if you configure the interval there.

Or with Bun:

```json
"statusLine": {
  "type": "command",
  "command": "bunx him0/claude-code-statusline",
  "refreshInterval": 60
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
