#!/usr/bin/env node
// Encode build/index.html like ../compress_activity.sh (openssl base64) so dev/host.html can load the real artifact.
import { readFileSync, writeFileSync } from "node:fs"
const html = readFileSync("build/index.html")
writeFileSync("dev/activity.b64", html.toString("base64").replace(/.{64}/g, "$&\n") + "\n")
console.log(`dev/activity.b64 written (${(html.length / 1024).toFixed(0)} KB html)`)
