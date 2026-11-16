/**
 * Parent-app bridge. Mirrors how every MindCheck/mindLAMP activity talks to its host
 * (MC-LAMP-dashboard EmbeddedActivity.tsx, which the phone apps load in a WebView):
 *
 *  in : one window "message" with {activity, configuration: {language}, autoCorrect, noBack}
 *  out: window.parent.postMessage(JSON.stringify(result), "*")  -> save (result.timestamp must be truthy)
 *       window.parent.postMessage(null, "*")                    -> close without saving
 */
import type { ActivityResult } from "@/survey/schema"

export interface HostActivity {
  id?: string
  name?: string
  spec?: string
  settings?: unknown
  [key: string]: unknown
}

export interface HostPayload {
  activity: HostActivity
  language: string
  noBack: boolean
}

type Listener = (p: HostPayload) => void

let latest: HostPayload | null = null
const listeners = new Set<Listener>()

/** Interpret a message from the host. Returns null for anything that isn't an activity launch. */
export function parseHostMessage(data: unknown): HostPayload | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null
  const d = data as Record<string, unknown>
  // Same fallback as the legacy activities: `data.activity ?? data`.
  const activity = (d.activity && typeof d.activity === "object" ? d.activity : "settings" in d ? d : null) as HostActivity | null
  if (!activity) return null
  const configuration = (d.configuration ?? {}) as { language?: unknown }
  return {
    activity,
    language: typeof configuration.language === "string" && configuration.language ? configuration.language : "en-US",
    noBack: d.noBack === true,
  }
}

function onMessage(e: MessageEvent) {
  const p = parseHostMessage(e.data)
  if (!p) return
  latest = p
  listeners.forEach((l) => l(p))
}

let installed = false
/** Start listening. Called at module load, before React renders, so the launch message is never missed. */
export function installBridge() {
  if (installed || typeof window === "undefined") return
  installed = true
  window.addEventListener("message", onMessage, false)
}

export function subscribe(l: Listener): () => void {
  listeners.add(l)
  if (latest) l(latest)
  return () => listeners.delete(l)
}

function target(): Window {
  return window.parent ?? window
}

export function sendResult(result: ActivityResult) {
  target().postMessage(JSON.stringify(result), "*")
}

export function sendCancel() {
  target().postMessage(null, "*")
}

/** Test helper. */
export function _resetBridge() {
  latest = null
  listeners.clear()
}

installBridge()
