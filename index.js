#!/usr/bin/env node
/**
 * claude-code-statusline
 * A status line generator for Claude Code CLI
 */
const { execSync } = require("child_process");
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

const EFFORT_SHORT = {
  low: "low",
  medium: "med",
  high: "hi",
  xhigh: "xhi",
  max: "max",
};

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

function saveToCache(repoPath, branch, prUrl, prNumber) {
  const cache = loadCache();
  cache[repoPath] = {
    branch,
    prUrl,
    prNumber,
    fetchedAt: Date.now(),
  };
  saveCache(cache);
}

function getPrInfo(repoPath, branch) {
  // Try cache first
  const cached = getFromCache(repoPath, branch);
  if (cached) {
    return cached.prUrl ? { url: cached.prUrl, number: cached.prNumber } : null;
  }

  // Fetch from gh CLI
  try {
    const result = execSync("gh pr view --json url,number,state", {
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
    saveToCache(repoPath, branch, prData.url, prData.number);
    return { url: prData.url, number: prData.number };
  } catch {
    // No PR or gh CLI error - don't cache so we can detect new PRs quickly
    return null;
  }
}

function createClickableLink(text, url) {
  // OSC 8 hyperlink escape sequence (using BEL terminator for better compatibility)
  return `\x1b]8;;${url}\x07${text}\x1b]8;;\x07`;
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

function formatDuration(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
    model += ` (${EFFORT_SHORT[data.effort.level] || data.effort.level})`;
  }
  const dirFull = data.workspace?.current_dir || data.cwd || "Unknown";
  const dir = dirFull.replace(home, "~");

  // 時間（wall / API）
  const duration = formatDuration(data.cost?.total_duration_ms ?? 0);
  const apiDuration = `[api ${formatDuration(
    data.cost?.total_api_duration_ms ?? 0,
  )}]`;

  // トークン数（context_window から）
  let tokens = "--";
  if (data.context_window) {
    const inputTokens = data.context_window.total_input_tokens ?? 0;
    const outputTokens = data.context_window.total_output_tokens ?? 0;
    tokens = `[↑${formatNumber(inputTokens)} ↓${formatNumber(outputTokens)}]`;
  }

  // 行数の増減（cost から）
  const linesAdded = data.cost?.total_lines_added ?? 0;
  const linesRemoved = data.cost?.total_lines_removed ?? 0;
  const lines = `[+${linesAdded} -${linesRemoved}]`;

  // Git
  let gitInfo = "";
  let repoLink = "";
  try {
    execSync("git rev-parse --git-dir", { stdio: "pipe", cwd: dirFull });

    // Get repository info for clickable link (from input)
    const repo = data.workspace?.repo;
    if (repo) {
      const url = `https://${repo.host}/${repo.owner}/${repo.name}`;
      repoLink = createClickableLink(repo.name, url);
    }

    let branch;
    try {
      branch = execSync("git rev-parse --abbrev-ref HEAD", {
        encoding: "utf8",
        stdio: "pipe",
        cwd: dirFull,
      }).trim();
    } catch {
      branch = "detached";
    }

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
    if (branch !== "detached") {
      const cleanBranch = branch.replace(/\*$/, "");
      const prInfo = getPrInfo(dirFull, cleanBranch);
      if (prInfo) {
        const prLink = createClickableLink(`PR#${prInfo.number}`, prInfo.url);
        gitInfo = `${branch} [${prLink}]`;
      }
    }

    if (data.worktree?.name || data.workspace?.git_worktree) {
      gitInfo = `(wt) ${gitInfo}`;
    }
  } catch {
    // Not a git repo
  }

  // Context（current_usage の合計を分子として使用）
  let context = "";
  if (data.context_window && data.context_window.used_percentage != null) {
    const percentage = data.context_window.used_percentage;
    const cu = data.context_window.current_usage || {};
    const currentUsageTotal =
      (cu.input_tokens ?? 0) +
      (cu.output_tokens ?? 0) +
      (cu.cache_creation_input_tokens ?? 0) +
      (cu.cache_read_input_tokens ?? 0);
    const windowSize = data.context_window.context_window_size ?? 200000;
    context = `${formatNumber(currentUsageTotal)}/${formatNumber(
      windowSize,
    )} [${percentage}%]`;
  }

  // 出力（3 グループに分けて | で区切る）
  const groups = [
    [repoLink || dir, gitInfo],
    [model, context],
    [duration, apiDuration, tokens, lines],
  ].map((g) => g.filter(Boolean).join(" ")).filter(Boolean);
  return groups.join(" | ");
}
