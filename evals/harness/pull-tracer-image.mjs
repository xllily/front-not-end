#!/usr/bin/env node
import { spawnSync } from "node:child_process";

import { tracerSandboxImage } from "./tracer-sandbox.mjs";

const result = spawnSync("docker", ["pull", tracerSandboxImage], {
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
