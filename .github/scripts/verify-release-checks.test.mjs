import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./verify-release-checks.sh", import.meta.url));
const commit = "a".repeat(40);
const otherCommit = "b".repeat(40);

function passingEvidence() {
  return {
    master: commit,
    checks: [{
      check_runs: ["Test (Node 22)", "Test (Node 24)", "Package skill"].map((name) => ({
        name,
        head_sha: commit,
        app: { slug: "github-actions" },
        status: "completed",
        conclusion: "success",
      })),
    }],
    analyses: [[{
      commit_sha: commit,
      ref: "refs/heads/master",
      tool: { name: "CodeQL" },
      environment: JSON.stringify({ language: "javascript-typescript" }),
      created_at: "2026-09-05T00:00:00Z",
      error: "",
      rules_count: 100,
    }]],
    alerts: [[]],
  };
}

async function verify(t, evidence) {
  const directory = await mkdtemp(path.join(tmpdir(), "front-not-end-release-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = path.join(directory, "evidence.json");
  await writeFile(fixture, JSON.stringify(evidence));
  await writeFile(path.join(directory, "gh"), `#!${process.execPath}
const fs = require("node:fs");
const evidence = JSON.parse(fs.readFileSync(process.env.FNE_RELEASE_EVIDENCE, "utf8"));
const args = process.argv.slice(2);
if (args[0] !== "api" || args.includes("--method")) process.exit(90);
const endpoint = args.find((arg) => arg.startsWith("repos/"));
const key = endpoint.includes("/check-runs?") ? "checks"
  : endpoint.includes("/analyses?") ? "analyses"
  : endpoint.includes("/alerts?") ? "alerts" : "master";
if (evidence.apiFailure === key) process.exit(1);
if (evidence.malformed === key) { process.stdout.write("invalid JSON"); process.exit(0); }
if (key === "master") {
  const marker = process.env.FNE_RELEASE_EVIDENCE + ".master-read";
  const secondRead = fs.existsSync(marker);
  fs.writeFileSync(marker, "read");
  process.stdout.write(secondRead ? (evidence.finalMaster ?? evidence.master) : evidence.master);
} else {
  if (!args.includes("--paginate") || !args.includes("--slurp")) process.exit(91);
  process.stdout.write(JSON.stringify(evidence[key]));
}
`, { mode: 0o755 });
  return spawnSync("bash", [script, "xllily/front-not-end", commit], {
    encoding: "utf8",
    timeout: 10_000,
    env: {
      ...process.env,
      PATH: `${directory}${path.delimiter}${process.env.PATH}`,
      FNE_RELEASE_EVIDENCE: fixture,
    },
  });
}

test("accepts successful exact-commit CI and JavaScript CodeQL evidence", async (t) => {
  const evidence = passingEvidence();
  evidence.alerts = [[{ rule: { security_severity_level: "medium" } }], []];
  const result = await verify(t, evidence);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Release CI and CodeQL checks passed/);
});

test("rejects a release whose branch-scoped alert evidence can drift", async (t) => {
  for (const field of ["master", "finalMaster"]) {
    await t.test(field, async (t) => {
      const evidence = passingEvidence();
      evidence[field] = otherCommit;
      assert.notEqual((await verify(t, evidence)).status, 0);
    });
  }
});

test("rejects missing, failed, pending, foreign-app, or stale required checks", async (t) => {
  for (const patch of [null, { conclusion: "failure" }, { status: "in_progress" },
    { app: { slug: "another-app" } }, { head_sha: otherCommit }]) {
    await t.test(JSON.stringify(patch), async (t) => {
      const evidence = passingEvidence();
      if (patch === null) evidence.checks[0].check_runs.pop();
      else Object.assign(evidence.checks[0].check_runs[0], patch);
      const result = await verify(t, evidence);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /required CI checks/);
    });
  }
});

test("requires current successful JavaScript analysis, not a different scan", async (t) => {
  for (const patch of [null, { commit_sha: otherCommit }, { error: "analysis failed" },
    { rules_count: 0 }, { environment: '{"language":"python"}' }]) {
    await t.test(JSON.stringify(patch), async (t) => {
      const evidence = passingEvidence();
      if (patch === null) evidence.analyses = [[]];
      else Object.assign(evidence.analyses[0][0], patch);
      const result = await verify(t, evidence);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /successful JavaScript CodeQL analysis/);
    });
  }
});

test("does not accept an older successful scan over a newer failed scan", async (t) => {
  const evidence = passingEvidence();
  evidence.analyses.push([{ ...evidence.analyses[0][0],
    created_at: "2026-09-06T00:00:00Z", error: "incomplete database" }]);
  assert.notEqual((await verify(t, evidence)).status, 0);
});

test("rejects High or Critical alerts on a later API page", async (t) => {
  for (const severity of ["high", "critical"]) {
    await t.test(severity, async (t) => {
      const evidence = passingEvidence();
      evidence.alerts.push([{ rule: { security_severity_level: severity } }]);
      const result = await verify(t, evidence);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /High\/Critical/);
    });
  }
});

test("fails closed when GitHub evidence is unavailable or malformed", async (t) => {
  for (const field of ["checks", "analyses", "alerts", "master"]) {
    await t.test(field, async (t) => {
      for (const failure of ["apiFailure", "malformed"]) {
        const evidence = passingEvidence();
        evidence[failure] = field;
        assert.notEqual((await verify(t, evidence)).status, 0);
      }
    });
  }
});

test("rejects an unexpected alert response shape instead of treating it as no alerts", async (t) => {
  const evidence = passingEvidence();
  evidence.alerts = [{}];
  const result = await verify(t, evidence);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected paginated alert arrays/);
});
