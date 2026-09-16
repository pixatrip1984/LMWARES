import { readFile } from "node:fs/promises";

const AUDIT_PATH = process.argv[2];

if (!AUDIT_PATH) {
  throw new Error("Usage: node scripts/validate-npm-audit.mjs <npm-audit.json>");
}

const TEMPORARY_ALLOWED_ADVISORIES = new Set([
  "https://github.com/advisories/GHSA-8j4g-w8fx-2239",
  "https://github.com/advisories/GHSA-f23p-vx2j-j53r",
  "https://github.com/advisories/GHSA-79qm-7rj5-m7r9",
  "https://github.com/advisories/GHSA-54fx-42gc-7vw4",
  "https://github.com/advisories/GHSA-gqvv-2mrq-wpjv",
  "https://github.com/advisories/GHSA-g6gw-c38x-mqfc",
  "https://github.com/advisories/GHSA-crvj-82cr-hjcx",
]);

const source = await readFile(AUDIT_PATH, "utf8");
let report;

try {
  report = JSON.parse(source);
} catch {
  throw new Error("npm audit did not produce valid JSON; failing closed.");
}

if (report?.auditReportVersion !== 2 || !report?.metadata?.vulnerabilities) {
  throw new Error("Unexpected npm audit report shape; failing closed.");
}

const counts = report.metadata.vulnerabilities;
for (const severity of ["high", "critical"]) {
  if ((counts[severity] ?? 0) > 0) {
    throw new Error(`npm audit reports ${counts[severity]} ${severity} vulnerability/vulnerabilities.`);
  }
}

const vulnerabilities = report.vulnerabilities ?? {};
const memo = new Map();

function validatePackage(name, trail = new Set()) {
  if (memo.has(name)) return memo.get(name);
  const vulnerability = vulnerabilities[name];
  if (!vulnerability) {
    throw new Error(`Audit report references missing vulnerability package: ${name}`);
  }
  if (trail.has(name)) {
    throw new Error(`Cyclic npm audit dependency chain detected at ${name}.`);
  }

  const nextTrail = new Set(trail);
  nextTrail.add(name);
  const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];

  if (via.length === 0) {
    throw new Error(`Vulnerability ${name} has no reviewable advisory chain.`);
  }

  for (const entry of via) {
    if (typeof entry === "string") {
      validatePackage(entry, nextTrail);
      continue;
    }

    const url = entry?.url;
    const severity = entry?.severity;
    if (severity === "high" || severity === "critical") {
      throw new Error(`Unacceptable ${severity} advisory for ${name}: ${url ?? "unknown URL"}`);
    }
    if (typeof url !== "string" || !TEMPORARY_ALLOWED_ADVISORIES.has(url)) {
      throw new Error(`Unreviewed npm advisory for ${name}: ${url ?? "missing URL"}`);
    }
  }

  memo.set(name, true);
  return true;
}

for (const name of Object.keys(vulnerabilities)) {
  validatePackage(name);
}

const allowedUrlsSeen = new Set();
for (const vulnerability of Object.values(vulnerabilities)) {
  for (const entry of Array.isArray(vulnerability.via) ? vulnerability.via : []) {
    if (typeof entry === "object" && typeof entry?.url === "string") {
      allowedUrlsSeen.add(entry.url);
    }
  }
}

for (const seen of allowedUrlsSeen) {
  if (!TEMPORARY_ALLOWED_ADVISORIES.has(seen)) {
    throw new Error(`Audit advisory escaped allowlist validation: ${seen}`);
  }
}

const total = counts.total ?? 0;
console.log(
  total === 0
    ? "npm audit: no production vulnerabilities reported."
    : `npm audit: ${total} known vulnerability record(s) match the exact temporary advisory exceptions tracked in issue #3.`,
);
