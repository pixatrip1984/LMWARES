import { readFile } from "node:fs/promises";

const AUDIT_PATH = process.argv[2];

if (!AUDIT_PATH) {
  throw new Error("Usage: node scripts/validate-npm-audit.mjs <npm-audit.json>");
}

const source = await readFile(AUDIT_PATH, "utf8");
let report;

try {
  report = JSON.parse(source);
} catch {
  throw new Error("npm audit did not produce valid JSON; failing closed.");
}

if (
  report?.auditReportVersion !== 2 ||
  !report?.metadata?.vulnerabilities ||
  typeof report.metadata.vulnerabilities !== "object" ||
  !report?.vulnerabilities ||
  typeof report.vulnerabilities !== "object" ||
  Array.isArray(report.vulnerabilities)
) {
  throw new Error("Unexpected npm audit report shape; failing closed.");
}

const counts = report.metadata.vulnerabilities;
const severities = ["info", "low", "moderate", "high", "critical"];

for (const severity of severities) {
  const count = counts[severity];
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`Invalid npm audit ${severity} vulnerability count; failing closed.`);
  }
}

if (!Number.isInteger(counts.total) || counts.total < 0) {
  throw new Error("Invalid npm audit total vulnerability count; failing closed.");
}

const severityTotal = severities.reduce((sum, severity) => sum + counts[severity], 0);
if (severityTotal !== counts.total) {
  throw new Error(
    `npm audit vulnerability counts are inconsistent: severities=${severityTotal}, total=${counts.total}.`,
  );
}

const vulnerabilities = report.vulnerabilities;
const vulnerablePackages = Object.keys(vulnerabilities);

if (counts.total === 0 && vulnerablePackages.length === 0) {
  console.log("npm audit: no production vulnerabilities reported.");
  process.exit(0);
}

const findings = vulnerablePackages.map((name) => {
  const vulnerability = vulnerabilities[name] ?? {};
  const advisoryUrls = (Array.isArray(vulnerability.via) ? vulnerability.via : [])
    .filter((entry) => entry && typeof entry === "object" && typeof entry.url === "string")
    .map((entry) => entry.url);

  return {
    package: name,
    severity: vulnerability.severity ?? "unknown",
    range: vulnerability.range ?? "unknown",
    advisories: advisoryUrls,
  };
});

console.error(JSON.stringify({ counts, findings }, null, 2));
throw new Error(
  `npm audit reports ${counts.total} production vulnerability record(s); zero known production vulnerabilities are allowed.`,
);
