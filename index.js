#!/usr/bin/env node
/**
 * claude-code-statusline
 * A status line generator for Claude Code CLI
 */
const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

// Cache configuration
const CACHE_FILE = path.join(
  process.env.HOME,
  ".claude",
  "cache",
  "statusline-pr-cache.json",
);
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Claude status page configuration
const STATUS_CACHE_FILE = path.join(
  process.env.HOME,
  ".claude",
  "cache",
  "statusline-status-cache.json",
);
const STATUS_PAGE_URL = "https://status.claude.com";
const STATUS_SUMMARY_URL = "https://status.claude.com/api/v2/summary.json";
const STATUS_COMPONENT_NAME = "Claude Code";
const DEFAULT_STATUS_CACHE_TTL_MS = 60 * 1000; // 1 minute
const STATUS_FETCH_TIMEOUT_MS = 5000;

const EFFORT_SHORT = {
  low: "low",
  medium: "med",
  high: "hi",
  xhigh: "xhi",
  max: "max",
};

const CLI_ARGS = process.argv.slice(2);
const SHOW_PR_TITLE = CLI_ARGS.includes("--pr-title");

function getCacheTtl() {
  const envTtl = process.env.STATUSLINE_PR_CACHE_TTL_MS;
  return envTtl ? parseInt(envTtl, 10) : DEFAULT_CACHE_TTL_MS;
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    }
  } catch {
    // Cache corrupted, return empty
  }
  return {};
}

function saveCache(cache) {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // Write failure, ignore
  }
}

function getFromCache(repoPath, branch) {
  const cache = loadCache();
  const entry = cache[repoPath];
  if (!entry || entry.branch !== branch) {
    return null;
  }
  const ttl = getCacheTtl();
  if (Date.now() - entry.fetchedAt > ttl) {
    return null;
  }
  return entry;
}

function saveToCache(repoPath, branch, prUrl, prNumber, prTitle) {
  const cache = loadCache();
  cache[repoPath] = {
    branch,
    prUrl,
    prNumber,
    prTitle,
    fetchedAt: Date.now(),
  };
  saveCache(cache);
}

function getPrInfo(repoPath, branch) {
  // Try cache first
  const cached = getFromCache(repoPath, branch);
  if (cached) {
    return cached.prUrl
      ? { url: cached.prUrl, number: cached.prNumber, title: cached.prTitle }
      : null;
  }

  // Fetch from gh CLI
  try {
    const result = execSync("gh pr view --json url,number,state,title", {
      cwd: repoPath,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 5000,
    });
    const prData = JSON.parse(result);
    // Only show PR link for open PRs
    if (prData.state !== "OPEN") {
      return null;
    }
    saveToCache(repoPath, branch, prData.url, prData.number, prData.title);
    return { url: prData.url, number: prData.number, title: prData.title };
  } catch {
    // No PR or gh CLI error - don't cache so we can detect new PRs quickly
    return null;
  }
}

function createClickableLink(text, url) {
  // OSC 8 hyperlink escape sequence (using BEL terminator for better compatibility)
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
}

// --- Claude status page integration ---

function getStatusCacheTtl() {
  const envTtl = process.env.STATUSLINE_STATUS_CACHE_TTL_MS;
  return envTtl ? parseInt(envTtl, 10) : DEFAULT_STATUS_CACHE_TTL_MS;
}

function loadStatusCache() {
  try {
    if (fs.existsSync(STATUS_CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(STATUS_CACHE_FILE, "utf8"));
    }
  } catch {
    // Cache corrupted, treat as empty
  }
  return {};
}

function saveStatusCache(cache) {
  try {
    const dir = path.dirname(STATUS_CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATUS_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // Write failure, ignore
  }
}

// Convert a statuspage component status (e.g. "partial_outage") into a
// human-readable label (e.g. "Partial Outage"). Unknown values fall back to a
// title-cased version of the raw string so future status values still render.
function formatStatusLabel(status) {
  return status
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// Decide whether a component status should surface a warning. "operational"
// is healthy; "under_maintenance" is planned and intentionally ignored.
function isUnhealthyStatus(status) {
  return status && status !== "operational" && status !== "under_maintenance";
}

// Fire-and-forget background refresh. Renders never wait on the network: when
// the cache is stale we stamp lastAttemptAt synchronously (so concurrent
// renders within the TTL don't spawn duplicate fetchers) and detach a child
// running `--status-refresh` to update the cache for the next render.
function maybeRefreshStatus() {
  if (process.env.STATUSLINE_STATUS_DISABLE === "1") return;
  const cache = loadStatusCache();
  const ttl = getStatusCacheTtl();
  const lastAttempt = cache.lastAttemptAt ?? 0;
  if (Date.now() - lastAttempt <= ttl) return;

  cache.lastAttemptAt = Date.now();
  saveStatusCache(cache);

  try {
    const child = spawn(process.execPath, [__filename, "--status-refresh"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    // Spawn failure, ignore
  }
}

// Build the trailing warning group from the cached status, or "" when healthy.
function statusWarning() {
  if (process.env.STATUSLINE_STATUS_DISABLE === "1") return "";
  const cache = loadStatusCache();
  if (!isUnhealthyStatus(cache.status)) return "";
  return createClickableLink(formatStatusLabel(cache.status), STATUS_PAGE_URL);
}

// `--status-refresh` mode: fetch the status page summary, extract the Claude
// Code component status, and persist it. Runs as a detached child, so it must
// not depend on stdin. On any failure it leaves the previous good status intact.
async function runStatusRefresh() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      STATUS_FETCH_TIMEOUT_MS,
    );
    const res = await fetch(STATUS_SUMMARY_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return;
    const data = await res.json();
    const component = (data.components || []).find(
      (c) => c.name === STATUS_COMPONENT_NAME,
    );
    if (!component) return;
    const cache = loadStatusCache();
    cache.status = component.status;
    cache.fetchedAt = Date.now();
    saveStatusCache(cache);
  } catch {
    // Network/parse failure: keep the last known status
  }
}

if (process.argv.slice(2).includes("--status-refresh")) {
  runStatusRefresh().finally(() => process.exit(0));
  return;
}

// Check if running directly (not from Claude Code)
if (process.stdin.isTTY) {
  const pkg = require("./package.json");
  console.log(`claude-code-statusline v${pkg.version}`);
  console.log("");
  console.log(
    "This tool is designed to be used with Claude Code's statusLine feature.",
  );
  console.log("");
  console.log("To enable, add the following to ~/.claude/settings.json:");
  console.log("");
  console.log('"statusLine": {');
  console.log('  "type": "command",');
  console.log('  "command": "npx him0/claude-code-statusline"');
  console.log("}");
  console.log("");
  console.log("Options:");
  console.log(
    "  --pr-title    Show PR title on a 2nd line as `<title> #<number>`",
  );
  console.log("                (suppresses the inline #N next to the branch)");
  console.log("");
  process.exit(0);
}

// Read JSON input from stdin
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const data = JSON.parse(input);
    const output = generateStatusLine(data);
    process.stdout.write(output);
  } catch (e) {
    process.stdout.write("Error: " + e.message);
  }
});

function truncateBranch(branch, maxLength = 25) {
  if (branch.length <= maxLength) return branch;
  const ellipsis = "…";
  const available = maxLength - ellipsis.length;
  const prefixLen = Math.ceil(available / 2);
  const suffixLen = Math.floor(available / 2);
  return branch.slice(0, prefixLen) + ellipsis + branch.slice(-suffixLen);
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) {
    return `${h}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

function formatNumber(n) {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return (m % 1 === 0 ? String(m) : m.toFixed(1)) + "M";
  }
  if (n >= 1000) {
    const k = n / 1000;
    return (k % 1 === 0 ? String(k) : k.toFixed(1)) + "k";
  }
  return String(n);
}

function parseContextWindowFromDisplayName(displayName) {
  if (!displayName) return null;
  const match = displayName.match(/\(([\d.]+)\s*([kKmM])?\s*context\)/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  const unit = (match[2] || "").toLowerCase();
  if (unit === "m") return num * 1_000_000;
  if (unit === "k") return num * 1_000;
  return num;
}

function generateStatusLine(data) {
  // デバッグ用ダンプ
  const home = process.env.HOME;
  fs.writeFileSync(
    path.join(home, ".claude", "statusline-input.json"),
    JSON.stringify(data, null, 2),
  );

  // 基本情報抽出
  let model = (data.model?.display_name || "Unknown")
    .replace(/^Claude /, "")
    .replace(/\s*\([^)]*\bcontext\b[^)]*\)/, "");
  if (data.effort?.level) {
    model += ` ${EFFORT_SHORT[data.effort.level] || data.effort.level}`;
  }
  const dirFull = data.workspace?.current_dir || data.cwd || "Unknown";
  const dir = dirFull.replace(home, "~");

  // 時間（api/wall = subset/total の比率順）
  const duration = `${formatDuration(
    data.cost?.total_api_duration_ms ?? 0,
  )}/${formatDuration(data.cost?.total_duration_ms ?? 0)}`;

  // トークン数（context_window から）
  let tokens = "--";
  if (data.context_window) {
    const inputTokens = data.context_window.total_input_tokens ?? 0;
    const outputTokens = data.context_window.total_output_tokens ?? 0;
    tokens = `[↑${formatNumber(inputTokens)} ↓${formatNumber(outputTokens)}]`;
  }

  // 行数の増減（cost から）— どちらも 0 のときは表示しない
  const linesAdded = data.cost?.total_lines_added ?? 0;
  const linesRemoved = data.cost?.total_lines_removed ?? 0;
  const lines =
    linesAdded === 0 && linesRemoved === 0
      ? ""
      : `+${linesAdded} -${linesRemoved}`;

  // 累計コスト（USD）
  const cost = `[$${(data.cost?.total_cost_usd ?? 0).toFixed(2)}]`;

  // Git
  let gitInfo = "";
  let repoLink = "";
  let prInfoForTitleLine = null;
  try {
    execSync("git rev-parse --git-dir", { stdio: "pipe", cwd: dirFull });

    // Get repository info for clickable link (from input)
    const repo = data.workspace?.repo;
    if (repo) {
      const url = `https://${repo.host}/${repo.owner}/${repo.name}`;
      repoLink = createClickableLink(repo.name, url);
    }

    let rawBranch;
    try {
      rawBranch = execSync("git rev-parse --abbrev-ref HEAD", {
        encoding: "utf8",
        stdio: "pipe",
        cwd: dirFull,
      }).trim();
    } catch {
      rawBranch = "detached";
    }

    let branch = truncateBranch(rawBranch);

    // Check for dirty (including untracked)
    const status = execSync(
      "git --no-optional-locks status --porcelain -unormal --ignore-submodules=dirty",
      { encoding: "utf8", stdio: "pipe", cwd: dirFull },
    );
    if (status.trim()) {
      branch += "*";
    }
    gitInfo = branch;

    // Add PR number if available
    if (rawBranch !== "detached") {
      const prInfo = getPrInfo(dirFull, rawBranch);
      if (prInfo) {
        if (SHOW_PR_TITLE) {
          // タイトル付きモードでは 2 行目に出すので、ブランチ横の #N は出さない
          prInfoForTitleLine = prInfo;
        } else {
          const prLink = createClickableLink(`#${prInfo.number}`, prInfo.url);
          gitInfo = `${branch} ${prLink}`;
        }
      }
    }

    if (data.worktree?.name || data.workspace?.git_worktree) {
      gitInfo = `(wt) ${gitInfo}`;
    }
  } catch {
    // Not a git repo
  }

  // Context（current_usage の合計を分子として使用）
  const cu = data.context_window?.current_usage || {};
  const currentUsageTotal =
    (cu.input_tokens ?? 0) +
    (cu.output_tokens ?? 0) +
    (cu.cache_creation_input_tokens ?? 0) +
    (cu.cache_read_input_tokens ?? 0);
  const windowSize =
    data.context_window?.context_window_size ??
    parseContextWindowFromDisplayName(data.model?.display_name) ??
    200000;
  const percentage =
    data.context_window?.used_percentage ??
    (windowSize > 0 ? Math.round((currentUsageTotal / windowSize) * 100) : 0);
  const context = `${formatNumber(currentUsageTotal)}/${formatNumber(
    windowSize,
  )} [${percentage}%]`;

  // 起動直後（API 未使用）は使用量グループを抑制
  const isFresh =
    (data.cost?.total_api_duration_ms ?? 0) === 0 &&
    (data.cost?.total_cost_usd ?? 0) === 0;

  // Claude のステータスを裏で更新し、障害時のみ末尾に警告を出す
  maybeRefreshStatus();
  const statusGroup = statusWarning();

  // 出力（グループに分けて | で区切る）
  const groups = [
    [repoLink || dir, gitInfo, lines],
    [model, context],
    isFresh ? [] : [duration, tokens, cost],
    [statusGroup],
  ].map((g) => g.filter(Boolean).join(" ")).filter(Boolean);
  const firstLine = groups.join(" | ");

  if (SHOW_PR_TITLE && prInfoForTitleLine && prInfoForTitleLine.title) {
    const titleLine = createClickableLink(
      `${prInfoForTitleLine.title} #${prInfoForTitleLine.number}`,
      prInfoForTitleLine.url,
    );
    return `${firstLine}\n${titleLine}`;
  }
  return firstLine;
}
