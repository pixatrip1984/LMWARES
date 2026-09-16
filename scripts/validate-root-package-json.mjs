import { readFile } from "node:fs/promises";

const PACKAGE_PATH = new URL("../package.json", import.meta.url);
const source = await readFile(PACKAGE_PATH, "utf8");

// JSON.parse silently keeps the last occurrence of a duplicate object key. For the
// root package.json we additionally inspect the formatted `scripts` object so a
// duplicated command name cannot shadow another command without failing CI.
const scriptsMatch = source.match(/\n  "scripts": \{([\s\S]*?)\n  \},\n  "devDependencies":/u);

if (!scriptsMatch) {
  throw new Error("Unable to locate the root package.json scripts object.");
}

const seen = new Set();
const duplicates = new Set();

for (const line of scriptsMatch[1].split("\n")) {
  const match = line.match(/^    "((?:\\.|[^"\\])+)":/u);
  if (!match) continue;

  const key = JSON.parse(`"${match[1]}"`);
  if (seen.has(key)) duplicates.add(key);
  seen.add(key);
}

if (duplicates.size > 0) {
  throw new Error(
    `Duplicate root package.json script key(s): ${[...duplicates].sort().join(", ")}`,
  );
}

JSON.parse(source);
console.log("Root package.json is valid and has no duplicate script keys.");
