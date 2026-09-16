import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validatePackageJson } from "./validate-root-package-json.mjs";

const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");

test("accepts the root package manifest with LF line endings", () => {
  assert.doesNotThrow(() => validatePackageJson(packageJson.replace(/\r\n?/g, "\n")));
});

test("accepts the root package manifest with CRLF line endings", () => {
  assert.doesNotThrow(() => validatePackageJson(packageJson.replace(/\r\n?/g, "\r\n")));
});

test("rejects duplicate script keys regardless of line endings", () => {
  const duplicate = packageJson.replace(/\r\n?/g, "\n").replace(
    '    "build": "turbo run build",',
    '    "build": "turbo run build",\n    "build": "turbo run build",',
  );

  assert.throws(
    () => validatePackageJson(duplicate.replace(/\r\n?/g, "\r\n")),
    /Duplicate root package\.json script key\(s\): build/,
  );
});
