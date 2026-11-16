/**
 * Minimal LAMP (MindCheck) API client for the builder. Plain fetch + HTTP Basic auth, exactly the
 * calls the dashboard makes (see MC-LAMP-server service/*.ts):
 *   GET  /researcher/me/study            GET /researcher           GET /researcher/:id/study
 *   GET  /study/:id/activity?ignore_binary=true                     GET /activity/:id
 *   PUT  /activity/:id {settings}        POST /study/:id/activity {name, spec, schedule, settings, category}
 *   GET  /type/:id/attachment/:key       PUT /type/:id/attachment/:key/me <value>
 */
import { SPEC_ID } from "@/survey/schema"

export interface Credentials {
  serverUrl: string
  username: string
  password: string
}

export interface Researcher {
  id: string
  name?: string
  email?: string
}
export interface Study {
  id: string
  name: string
}
export interface ActivitySummary {
  id: string
  name: string
  spec: string
  schedule?: unknown[]
  category?: string[] | null
}
export interface ActivityFull extends ActivitySummary {
  settings: unknown
}

export class LampApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(code: string, status: number, message: string) {
    super(message)
    this.code = code
    this.status = status
  }
}

export function normalizeServerUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, "")
  if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`
  return u
}

/** True when credentials would travel unencrypted (http:// to a non-local host). */
export function isInsecureUrl(url: string): boolean {
  const u = normalizeServerUrl(url)
  if (!u.startsWith("http://")) return false
  try {
    const host = new URL(u).hostname
    return !(host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost"))
  } catch {
    return true
  }
}

function basicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  return `Basic ${btoa(String.fromCharCode(...bytes))}`
}

function friendly(code: string, status: number): string {
  if (code.startsWith("401") || status === 401) return "The email or password was not accepted."
  if (code === "403.security-context-out-of-scope" || status === 403) return "This account doesn't have access to that study or activity."
  if (code.startsWith("404") || status === 404) return "Not found on the server."
  if (code === "network") return "Couldn't reach the server. Check the address and your internet connection."
  return `The server returned an error (${code || status}).`
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function createLampClient(creds: Credentials, fetchImpl: FetchLike = (i, init) => fetch(i, init)) {
  const base = normalizeServerUrl(creds.serverUrl)
  const auth = basicAuth(creds.username, creds.password)

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetchImpl(base + path, {
        method,
        headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit",
      })
    } catch {
      throw new LampApiError("network", 0, friendly("network", 0))
    }
    let json: { data?: unknown; error?: string } | null
    try {
      json = (await res.json()) as { data?: unknown; error?: string }
    } catch {
      json = null
    }
    if (!res.ok || json?.error) {
      const code = json?.error ?? String(res.status)
      throw new LampApiError(code, res.status, friendly(code, res.status))
    }
    return json?.data as T
  }

  return {
    baseUrl: base,

    /** Studies of the signed-in researcher. Admin accounts get code "400.context-substitution-failed". */
    listMyStudies: () => request<Study[]>("GET", "/researcher/me/study"),
    listResearchers: () => request<Researcher[]>("GET", "/researcher"),
    listStudies: (researcherId: string) => request<Study[]>("GET", `/researcher/${encodeURIComponent(researcherId)}/study`),

    listActivities: (studyId: string) =>
      request<ActivitySummary[]>("GET", `/study/${encodeURIComponent(studyId)}/activity?ignore_binary=true`),

    async listSurveys(studyId: string) {
      const all = await this.listActivities(studyId)
      return (all ?? []).filter((a) => a.spec === SPEC_ID)
    },

    async getActivity(id: string): Promise<ActivityFull> {
      const d = await request<ActivityFull | ActivityFull[]>("GET", `/activity/${encodeURIComponent(id)}`)
      const a = Array.isArray(d) ? d[0] : d
      if (!a) throw new LampApiError("404.not-found", 404, friendly("404", 404))
      return a
    },

    /** Partial update: the server keeps name, schedule and category when they are omitted. */
    updateSettings: (id: string, settings: unknown) => request<unknown>("PUT", `/activity/${encodeURIComponent(id)}`, { settings }),

    createActivity: (studyId: string, activity: { name: string; settings: unknown; category?: string[] }) =>
      request<string>("POST", `/study/${encodeURIComponent(studyId)}/activity`, {
        name: activity.name,
        spec: SPEC_ID,
        schedule: [],
        settings: activity.settings,
        category: activity.category ?? ["assess"],
      }),

    async getAttachment<T>(typeId: string, key: string): Promise<T | null> {
      try {
        return await request<T | null>("GET", `/type/${encodeURIComponent(typeId)}/attachment/${encodeURIComponent(key)}`)
      } catch (e) {
        if (e instanceof LampApiError && (e.status === 404 || e.code.startsWith("404"))) return null
        throw e
      }
    },

    async setAttachment(typeId: string, key: string, value: unknown): Promise<void> {
      const r = await request<unknown>("PUT", `/type/${encodeURIComponent(typeId)}/attachment/${encodeURIComponent(key)}/me`, value)
      // The server answers {data: null} when the write failed.
      if (r === null) throw new LampApiError("500.attachment-write-failed", 500, "The server could not save the version history.")
    },
  }
}

export type LampClient = ReturnType<typeof createLampClient>

export const HISTORY_KEY = "lamp.survey_new.history"
export const DETAILS_KEY = "lamp.dashboard.activity_details"
export const HISTORY_LIMIT = 20

export interface Revision {
  version?: string
  /** 0 = recorded before the first publish from the builder (date unknown). */
  publishedAt: number
  publishedBy?: string
  note?: string
  settings: unknown
}
export interface HistoryDoc {
  revisions: Revision[]
}
