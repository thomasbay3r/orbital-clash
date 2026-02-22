// Hook: Auto-deploy to Cloudflare after git push
// Triggered by PostToolUse on Bash commands containing "git push"

const input = require("fs").readFileSync("/dev/stdin", "utf8");
let data;
try {
  data = JSON.parse(input);
} catch {
  process.exit(0);
}

const command = data?.tool_input?.command || "";
if (!command.includes("git push")) {
  process.exit(0);
}

const { execSync } = require("child_process");
try {
  execSync("npm run deploy", {
    cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
    stdio: "pipe",
    timeout: 120_000,
  });
  const out = JSON.stringify({ systemMessage: "Auto-deployed to Cloudflare after git push." });
  process.stdout.write(out);
} catch (err) {
  const out = JSON.stringify({ systemMessage: `Deploy failed after git push: ${err.message}` });
  process.stdout.write(out);
}
