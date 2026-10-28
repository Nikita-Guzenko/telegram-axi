import { test } from "node:test";
import assert from "node:assert";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const binPath = join(fileURLToPath(new URL(".", import.meta.url)), "../dist/bin/telegram-axi.js");

test("fast path --version prints bare version", () => {
  const output = execSync(`${binPath} --version`, { encoding: "utf-8" }).trim();
  assert.match(output, /^\d+\.\d+\.\d+$/);
});

test("catalog lists all 11 categories", () => {
  const output = execSync(`${binPath} catalog`, { encoding: "utf-8" });
  assert.match(output, /total_categories:\s*11/);
  assert.match(output, /identity/);
  assert.match(output, /messages/);
  assert.match(output, /media/);
  assert.match(output, /payments/);
});

test("inspect returns parameter spec", () => {
  const output = execSync(`${binPath} inspect sendMessage`, { encoding: "utf-8" });
  assert.match(output, /method:\s*sendMessage/);
  assert.match(output, /chat_id/);
  assert.match(output, /telegram-axi send/);
});

test("missing required flags exit with non-zero and structured error", () => {
  try {
    execSync(`${binPath} send`, { encoding: "utf-8", stdio: "pipe" });
    assert.fail("Should have thrown error");
  } catch (err: any) {
    assert.strictEqual(err.status, 1);
    assert.match(err.stdout.toString(), /error:\s*Missing/);
    assert.match(err.stdout.toString(), /code:\s*INVALID_ARGS/);
  }
});
