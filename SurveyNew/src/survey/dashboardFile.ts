/**
 * Dashboard Import/Export file format: base64 of a UTF-8 JSON array of activities.
 * Mirrors MC-LAMP-dashboard ExportActivity (`btoa(unescape(encodeURIComponent(json)))`) and
 * ImportActivity (`JSON.parse(decodeURIComponent(escape(atob(text))))`).
 */
import type { SurveyDefinition } from "./schema"
import { SPEC_ID } from "./schema"

export interface DashboardActivity {
  id?: string
  name: string
  spec: string
  schedule: unknown[]
  settings: unknown
  category?: string[] | null
  description?: string
  photo?: string | null
  streak?: unknown
  showFeed?: unknown
  visualSettings?: unknown
  [key: string]: unknown
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function base64ToUtf8(b64: string): string {
  const bin = atob(b64.replace(/\s+/g, ""))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeDashboardFile(activities: DashboardActivity[]): string {
  return utf8ToBase64(JSON.stringify(activities))
}

/** Accepts a dashboard export (base64) or plain JSON text. Returns the parsed value. */
export function decodeDashboardFile(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed)
  return JSON.parse(base64ToUtf8(trimmed))
}

export function makeDashboardActivity(
  survey: SurveyDefinition,
  meta: { name: string; description?: string; category?: string[] },
): DashboardActivity {
  return {
    name: meta.name,
    spec: SPEC_ID,
    schedule: [],
    settings: survey,
    category: meta.category ?? ["assess"],
    description: meta.description ?? "",
    photo: null,
    streak: null,
    showFeed: null,
    visualSettings: null,
  }
}
