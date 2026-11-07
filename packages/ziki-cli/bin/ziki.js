#!/usr/bin/env node
import { run } from "../src/cli.js";

const result = await run(process.argv.slice(2), {});
process.stdout.write(result.text);
// Let success exit cleanly: process.exit() with open fetch handles trips a
// libuv assertion on Windows. Only force the code on failure.
if (result.code !== 0) {
  process.exit(result.code);
}
