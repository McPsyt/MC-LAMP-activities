#!/usr/bin/env node
/**
 * Guards for single-file bundles:
 *  1. Pure ASCII. The dashboard decodes activities with atob() (Latin-1), so any UTF-8 byte would be garbled.
 *     Non-ASCII characters left by the bundler are escaped here (\uXXXX in scripts, \XXXXXX in styles,
 *     &#x...; in markup); anything we can't place safely fails the build.
 *  2. No external resources (<script src>, <link href>, url(http...)) - activities must work offline in a sandboxed iframe.
 * Usage: node scripts/check-bundle.mjs <file.html> [--max-kb N]
 */
import { readFileSync, writeFileSync, statSync } from "node:fs"

const file = process.argv[2]
const maxIdx = process.argv.indexOf("--max-kb")
const maxKb = maxIdx > 0 ? Number(process.argv[maxIdx + 1]) : Infinity
if (!file) {
  console.error("usage: check-bundle.mjs <file.html>")
  process.exit(2)
}

let html = readFileSync(file, "utf8")
let fixed = 0

const escJs = (s) =>
  s.replace(/[^\x00-\x7f]/gu, (ch) => {
    fixed++
    const cp = ch.codePointAt(0)
    if (cp <= 0xffff) return "\\u" + cp.toString(16).padStart(4, "0")
    const v = cp - 0x10000
    return "\\u" + (0xd800 + (v >> 10)).toString(16) + "\\u" + (0xdc00 + (v & 0x3ff)).toString(16)
  })
const escCss = (s) =>
  s.replace(/[^\x00-\x7f]/gu, (ch) => {
    fixed++
    return "\\" + ch.codePointAt(0).toString(16).padStart(6, "0")
  })
const escHtml = (s) =>
  s.replace(/[^\x00-\x7f]/gu, (ch) => {
    fixed++
    return "&#x" + ch.codePointAt(0).toString(16) + ";"
  })

// Escape inside <script> and <style>, then markup.
const parts = []
let rest = html
const re = /<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/i
for (;;) {
  const m = re.exec(rest)
  if (!m) {
    parts.push(escHtml(rest))
    break
  }
  const open = m[0].slice(0, m[0].indexOf(">") + 1)
  parts.push(escHtml(rest.slice(0, m.index)), open, m[1].toLowerCase() === "script" ? escJs(m[2]) : escCss(m[2]), `</${m[1]}>`)
  rest = rest.slice(m.index + m[0].length)
}
html = parts.join("")

const problems = []
if (/[^\x00-\x7f]/.test(html)) problems.push("non-ASCII characters remain")
for (const m of html.matchAll(/<(script|link|img|iframe)\b[^>]*\b(src|href)\s*=\s*["']?([^"'\s>]+)/gi)) {
  if (!m[3].startsWith("data:") && !m[3].startsWith("#")) problems.push(`external ${m[1]} ${m[2]}=${m[3]}`)
}
for (const m of html.matchAll(/url\(\s*["']?(https?:[^)"']+)/gi)) problems.push(`external url(${m[1]})`)

if (fixed) writeFileSync(file, html)
const kb = statSync(file).size / 1024
console.log(`check-bundle: ${file} ${kb.toFixed(0)} KB, ascii-escaped ${fixed} chars`)
if (kb > maxKb) problems.push(`size ${kb.toFixed(0)} KB > ${maxKb} KB`)
if (problems.length) {
  console.error("check-bundle FAILED:\n - " + problems.join("\n - "))
  process.exit(1)
}
