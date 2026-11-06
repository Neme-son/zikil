#!/usr/bin/env node
import { run } from "../src/cli.js";

const result = await run(process.argv.slice(2), {});
process.stdout.write(result.text);
process.exit(result.code);
