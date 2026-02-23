#!/usr/bin/env node
// Post-deploy smoke test: verifies critical API endpoints respond correctly.
// Run: npm run deploy:smoke

const BASE = "https://orbital-clash.thomas-bay3r.workers.dev";

const tests = [
  {
    name: "Health check",
    url: "/api/health",
    method: "GET",
    expect: (res, body) => res.status === 200 && body.status === "ok",
  },
  {
    name: "Guest auth",
    url: "/api/auth/guest",
    method: "POST",
    expect: (res, body) => res.status === 200 && body.token && body.displayName,
  },
  {
    name: "Register validation (empty body)",
    url: "/api/auth/register",
    method: "POST",
    body: {},
    expect: (res, body) => res.status === 400 && body.error,
  },
  {
    name: "Login validation (empty body)",
    url: "/api/auth/login",
    method: "POST",
    body: {},
    expect: (res, body) => res.status === 400 && body.error,
  },
  {
    name: "Register validation (short password)",
    url: "/api/auth/register",
    method: "POST",
    body: { email: "test@test.com", username: "smoketest", password: "abc" },
    expect: (res, body) => res.status === 400 && body.error.includes("6 Zeichen"),
  },
];

async function run() {
  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const res = await fetch(`${BASE}${test.url}`, {
        method: test.method,
        headers: { "Content-Type": "application/json" },
        body: test.body ? JSON.stringify(test.body) : undefined,
      });

      const body = await res.json().catch(() => ({}));

      if (test.expect(res, body)) {
        console.log(`  OK  ${test.name}`);
        passed++;
      } else {
        console.error(`  FAIL  ${test.name} — status=${res.status} body=${JSON.stringify(body).slice(0, 200)}`);
        failed++;
      }
    } catch (err) {
      console.error(`  FAIL  ${test.name} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
