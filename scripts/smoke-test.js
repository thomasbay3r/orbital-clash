#!/usr/bin/env node
// Post-deploy smoke test for Cloudflare Workers + D1 projects.
// Verifies: API responds, D1 schema exists, auth flow works.
// Run: npm run deploy:smoke
//
// Pattern: reusable for any Workers + D1 project — adjust BASE and tests array.

const BASE = process.env.SMOKE_TEST_URL || "https://orbital-clash.thomas-bay3r.workers.dev";

const tests = [
  // --- Infrastructure ---
  {
    name: "Worker responds (health)",
    url: "/api/health",
    method: "GET",
    expect: (res) => res.status === 200,
  },

  // --- D1 schema exists (the bug that bit us) ---
  // Guest auth does INSERT INTO guest_sessions — proves table exists
  {
    name: "D1: guest_sessions table exists",
    url: "/api/auth/guest",
    method: "POST",
    expect: (res, body) => res.status === 200 && body.token && body.displayName,
  },
  // Register validation hits SELECT on accounts — proves table exists
  {
    name: "D1: accounts table exists",
    url: "/api/auth/register",
    method: "POST",
    body: { email: "smoke@test.dev", username: "smoke_test_user", password: "test123456" },
    // 409 (duplicate) or 200 (created) both prove the table exists
    // 500 with "no such table" = schema not applied
    expect: (res) => res.status === 200 || res.status === 409,
  },

  // --- Auth validation (error handling works) ---
  {
    name: "Auth: register rejects empty body",
    url: "/api/auth/register",
    method: "POST",
    body: {},
    expect: (res, body) => res.status === 400 && !!body.error,
  },
  {
    name: "Auth: register rejects short password",
    url: "/api/auth/register",
    method: "POST",
    body: { email: "a@b.c", username: "abc", password: "abc" },
    expect: (res, body) => res.status === 400 && body.error.includes("6 Zeichen"),
  },
  {
    name: "Auth: login rejects empty body",
    url: "/api/auth/login",
    method: "POST",
    body: {},
    expect: (res, body) => res.status === 400 && !!body.error,
  },

  // --- API routes exist (no 404s) ---
  {
    name: "Route: /api/friends requires auth",
    url: "/api/friends",
    method: "GET",
    expect: (res) => res.status === 401 || res.status === 403,
  },
  {
    name: "Route: /api/profile requires auth",
    url: "/api/profile",
    method: "GET",
    expect: (res) => res.status === 401,
  },
  {
    name: "Route: /api/tutorial requires auth",
    url: "/api/tutorial",
    method: "PATCH",
    body: { enabled: true, seen: [] },
    expect: (res) => res.status === 401,
  },
];

async function run() {
  console.log(`Smoke testing: ${BASE}\n`);
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
