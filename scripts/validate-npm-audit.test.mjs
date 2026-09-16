import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const SCRIPT = new URL("./validate-npm-audit.mjs", import.meta.url);

function runAuditValidator(reportSource) {
  const dir = mkdtempSync(join(tmpdir(), "lmwares-audit-policy-"));
  const reportPath = join(dir, "audit.json");
  writeFileSync(reportPath, reportSource, "utf8");

  try {
    return spawnSync(process.execPath, [SCRIPT.pathname, reportPath], {
      encoding: "utf8",
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function cleanReport() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {},
    metadata: {
      vulnerabilities: {
        info: 0,
        low: 0,
        moderate: 0,
        high: 0,
        critical: 0,
        total: 0,
      },
    },
  };
}

test("accepts a clean production audit", () => {
  const result = runAuditValidator(JSON.stringify(cleanReport()));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no production vulnerabilities reported/i);
});

test("rejects a moderate production vulnerability", () => {
  const report = cleanReport();
  report.metadata.vulnerabilities.moderate = 1;
  report.metadata.vulnerabilities.total = 1;
  report.vulnerabilities.hono = {
    severity: "moderate",
    range: "<4.13.8",
    via: [
      {
        url: "https://github.com/advisories/GHSA-example-moderate",
      },
    ],
  };

  const result = runAuditValidator(JSON.stringify(report));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /zero known production vulnerabilities are allowed/i);
});

test("rejects a high production vulnerability", () => {
  const report = cleanReport();
  report.metadata.vulnerabilities.high = 1;
  report.metadata.vulnerabilities.total = 1;
  report.vulnerabilities.example = {
    severity: "high",
    range: "<=1.0.0",
    via: [],
  };

  const result = runAuditValidator(JSON.stringify(report));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /production vulnerability record/i);
});

test("fails closed on malformed JSON", () => {
  const result = runAuditValidator("{not-json");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /did not produce valid JSON/i);
});

test("fails closed on inconsistent vulnerability counts", () => {
  const report = cleanReport();
  report.metadata.vulnerabilities.moderate = 1;
  report.metadata.vulnerabilities.total = 0;

  const result = runAuditValidator(JSON.stringify(report));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /counts are inconsistent/i);
});

test("rejects vulnerability objects even if metadata incorrectly claims zero", () => {
  const report = cleanReport();
  report.vulnerabilities.example = {
    severity: "moderate",
    range: "*",
    via: [],
  };

  const result = runAuditValidator(JSON.stringify(report));
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /zero known production vulnerabilities are allowed/i);
});
