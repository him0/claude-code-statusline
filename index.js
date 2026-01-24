#!/usr/bin/env node
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
  // iTerm2 OSC 8 escape sequence
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

// Check if running directly (not from Claude Code)
if (process.stdin.isTTY) {
  const pkg = require("./package.json");
  console.log(`claude-code-statusline v${pkg.version}`);
  console.log("");
  console.log("This tool is designed to be used with Claude Code's statusLine feature.");
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

function formatNumber(n) {
  if (n >= 1000) {
    return (n / 1000).toFixed(1) + "k";
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
  const model = (data.model?.display_name || "Unknown").replace(/^Claude /, "");
  const dirFull = data.workspace?.current_dir || data.cwd || "Unknown";
  const dir = dirFull.replace(home, "~");

  // 時間（APIから）
  const durationMs = data.cost?.total_duration_ms ?? 0;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  const duration = `${String(minutes).padStart(2, "0")}:${String(
    seconds,
  ).padStart(2, "0")}`;

  // トークン数（トランスクリプトから）
  let tokens = "--";
  const transcript = data.transcript_path;
  if (transcript && fs.existsSync(transcript)) {
    const content = fs.readFileSync(transcript, "utf8");
    const inputMatches = content.match(/"input_tokens":(\d+)/g) || [];
    const outputMatches = content.match(/"output_tokens":(\d+)/g) || [];

    const inputTokens = inputMatches.reduce(
      (sum, m) => sum + parseInt(m.match(/\d+/)[0], 10),
      0,
    );
    const outputTokens = outputMatches.reduce(
      (sum, m) => sum + parseInt(m.match(/\d+/)[0], 10),
      0,
    );
    const totalTokens = inputTokens + outputTokens;
    tokens = `↑${formatNumber(inputTokens)} ↓${formatNumber(
      outputTokens,
    )} (${formatNumber(totalTokens)})`;
  }

  // Git
  let gitInfo = "";
  try {
    execSync("git rev-parse --git-dir", { stdio: "pipe", cwd: dirFull });
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
        const prLink = createClickableLink(`[PR#${prInfo.number}]`, prInfo.url);
        gitInfo = `${branch} ${prLink}`;
      }
    }
  } catch {
    // Not a git repo
  }

  // Context（used_percentage を直接使用）
  let context = "";
  if (data.context_window && data.context_window.used_percentage != null) {
    const percentage = data.context_window.used_percentage;
    const totalInput = data.context_window.total_input_tokens ?? 0;
    const windowSize = data.context_window.context_window_size ?? 200000;
    context = `${formatNumber(totalInput)}/${formatNumber(
      windowSize,
    )} (${percentage}%)`;
  }

  // 出力
  const parts = [dir, gitInfo, model, duration, tokens, context].filter(
    Boolean,
  );
  return parts.join(" | ");
}
