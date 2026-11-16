/**
 * Parent-app simulator (dev + Playwright E2E). Behaves like MC-LAMP-dashboard EmbeddedActivity.tsx:
 *  - iframe srcdoc with the same sandbox/allow attributes
 *  - posts {activity, configuration: {language}, autoCorrect, noBack} on iframe load
 *  - JSON.parse()s messages; `null` = closed, object with timestamp = saved
 * Query params: ?template=<id>&lang=<code>&noBack=1&source=built|dev&embedded=1&id=<activityId>&autostart=1
 */
import { TEMPLATES } from "../src/templates"

declare global {
  interface Window {
    __results: unknown[]
    __launch: (settings: unknown, opts?: { language?: string; noBack?: boolean; id?: string; name?: string }) => Promise<void>
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const params = new URLSearchParams(location.search)
if (params.get("embedded")) document.body.classList.add("embedded")

const templateSel = $<HTMLSelectElement>("template")
const settingsBox = $<HTMLTextAreaElement>("settings")
const langSel = $<HTMLSelectElement>("language")
const noBackBox = $<HTMLInputElement>("noBack")
const sourceSel = $<HTMLSelectElement>("source")
const log = $<HTMLPreElement>("log")

for (const t of TEMPLATES) templateSel.add(new Option(t.name, t.id))
const pick = (id: string) => {
  const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0]
  templateSel.value = t.id
  settingsBox.value = JSON.stringify(t.survey, null, 2)
}
pick(params.get("template") ?? "medication")
templateSel.onchange = () => pick(templateSel.value)
if (params.get("lang")) langSel.value = params.get("lang")!
noBackBox.checked = params.get("noBack") === "1"
if (params.get("source")) sourceSel.value = params.get("source")!

window.__results = []
window.addEventListener("message", (e) => {
  if (e.source === window) return
  let entry: unknown
  if (e.data === null) entry = { closed: true }
  else {
    try {
      entry = JSON.parse(e.data)
    } catch {
      entry = { unparseable: String(e.data) }
    }
  }
  window.__results.push(entry)
  log.textContent = JSON.stringify(window.__results, null, 2)
})

let activityHtml: string | null = null
async function loadActivity(source: string): Promise<string | null> {
  if (source === "dev") return null
  if (activityHtml) return activityHtml
  const res = await fetch(`./activity.b64?${Date.now()}`)
  if (!res.ok) throw new Error("dev/activity.b64 missing - run `npm run build && node scripts/make-dev-b64.mjs`")
  activityHtml = atob(await res.text()) // exactly what the dashboard does (Latin-1 decode)
  return activityHtml
}

window.__launch = async (settings, opts = {}) => {
  const container = $("frame")
  container.innerHTML = ""
  const iframe = document.createElement("iframe")
  iframe.setAttribute(
    "allow",
    "accelerometer; ambient-light-sensor; autoplay; battery; camera; display-capture; geolocation; gyroscope; magnetometer; microphone 'src' 'self'; oversized-images; sync-xhr; usb; wake-lock;X-Frame-Options",
  )
  iframe.setAttribute("sandbox", "allow-forms allow-same-origin allow-scripts allow-popups allow-top-navigation ")
  iframe.title = "activity"
  const payload = {
    activity: {
      id: opts.id ?? "dev-activity-1",
      name: opts.name ?? "Survey_New",
      spec: "lamp.survey_new",
      settings,
      schedule: [],
    },
    configuration: { language: opts.language ?? langSel.value },
    autoCorrect: true,
    noBack: opts.noBack ?? noBackBox.checked,
  }
  iframe.onload = () => iframe.contentWindow?.postMessage(payload, "*")
  const html = await loadActivity(sourceSel.value)
  if (html === null) iframe.src = "/index.html"
  else iframe.srcdoc = html
  container.appendChild(iframe)
}

$("launch").onclick = () => {
  let settings: unknown
  try {
    settings = JSON.parse(settingsBox.value)
  } catch (e) {
    alert(`Settings JSON is invalid: ${e}`)
    return
  }
  void window.__launch(settings)
}

if (params.get("autostart")) $("launch").click()
