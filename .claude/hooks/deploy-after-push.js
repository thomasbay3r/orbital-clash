// Hook: Auto-deploy to Cloudflare after git push
// Triggered by PostToolUse on Bash commands containing "git push"

const chunks = [];
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  let data;
  try {
    data = JSON.parse(chunks.join(""));
  } catch {
    process.exit(0);
  }

  const command = data?.tool_input?.command || "";
  if (!command.includes("git push")) {
    process.exit(0);
  }

  const { execSync } = require("child_process");
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  try {
    execSync("npm run deploy", { cwd, stdio: "pipe", timeout: 120_000 });

    // Run smoke test against live API
    try {
      execSync("npm run deploy:smoke", { cwd, stdio: "pipe", timeout: 30_000 });
      process.stdout.write(JSON.stringify({
        systemMessage: "Auto-deployed to Cloudflare after git push. Smoke test passed.",
      }));
    } catch (smokeErr) {
      process.stdout.write(JSON.stringify({
        systemMessage: "Deployed but SMOKE TEST FAILED: " + smokeErr.stdout?.toString().slice(-300),
      }));
    }
  } catch (err) {
    process.stdout.write(JSON.stringify({
      systemMessage: "Deploy failed after git push: " + err.message,
    }));
  }
});
