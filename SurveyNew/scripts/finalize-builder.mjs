#!/usr/bin/env node
// Copy the single-file builder to release/survey-builder.html after checking it is self-contained.
import { copyFileSync, mkdirSync } from "node:fs"
import { execFileSync } from "node:child_process"
execFileSync(process.execPath, ["scripts/check-bundle.mjs", "build-builder/builder.html"], { stdio: "inherit" })
mkdirSync("release", { recursive: true })
copyFileSync("build-builder/builder.html", "release/survey-builder.html")
console.log("release/survey-builder.html updated")
