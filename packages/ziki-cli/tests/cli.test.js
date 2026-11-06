import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../src/cli.js";

test("help lists every Milestone 1 command", async () => {
  const result = await run(["help"], {});
  assert.equal(result.code, 0);
  for (const name of ["login", "connect", "setup-opencode", "work", "status", "doctor", "sync"]) {
    assert.match(result.text, new RegExp(name));
  }
});

test("unknown command fails with usage", async () => {
  const result = await run(["frobnicate"], {});
  assert.equal(result.code, 2);
  assert.match(result.text, /unknown command/);
});
