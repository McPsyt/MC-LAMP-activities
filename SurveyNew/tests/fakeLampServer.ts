/**
 * In-memory stand-in for the MindCheck/LAMP API routes the builder uses. Shared by Vitest (fetch stub)
 * and Playwright (page.route). Mirrors MC-LAMP-server behaviour: Basic auth, {data}/{error} bodies,
 * partial PUT /activity, {data: null} for failed attachment writes, 400 for "me" with admin accounts.
 */
export interface FakeActivity {
  id: string
  name: string
  spec: string
  settings: unknown
  schedule: unknown[]
  category: string[] | null
  study: string
}

export interface FakeState {
  users: Record<string, { password: string; researcherId: string | null }>
  researchers: Array<{ id: string; name: string }>
  studies: Record<string, Array<{ id: string; name: string }>>
  activities: Record<string, FakeActivity>
  attachments: Record<string, unknown>
  log: string[]
  failAttachmentWrites?: boolean
  nextId: number
}

export function createFakeState(seed?: Partial<FakeState>): FakeState {
  return {
    users: { "researcher@study.org": { password: "secret", researcherId: "res1" }, "admin@study.org": { password: "admin", researcherId: null } },
    researchers: [{ id: "res1", name: "Dr. Research" }],
    studies: { res1: [{ id: "study1", name: "Pilot study" }] },
    activities: {},
    attachments: {},
    log: [],
    nextId: 100,
    ...seed,
  }
}

export interface FakeResponse {
  status: number
  body: unknown
}

function decodeAuth(header: string | null | undefined): [string, string] | null {
  if (!header?.startsWith("Basic ")) return null
  try {
    const bytes = Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0))
    const s = new TextDecoder().decode(bytes)
    const i = s.indexOf(":")
    return [s.slice(0, i), s.slice(i + 1)]
  } catch {
    return null
  }
}

export function handleFake(state: FakeState, method: string, url: string, authHeader: string | null | undefined, body: unknown): FakeResponse {
  const u = new URL(url)
  const path = decodeURIComponent(u.pathname)
  state.log.push(`${method} ${path}${u.search}`)
  const creds = decodeAuth(authHeader)
  const user = creds && state.users[creds[0]]
  if (!user || user.password !== creds![1]) return { status: 401, body: { error: "401.missing-credentials" } }
  const ok = (data: unknown) => ({ status: 200, body: { data } })
  const err = (code: string) => ({ status: Number(code.split(".")[0]), body: { error: code } })
  let m: RegExpExecArray | null

  if ((m = /^\/researcher\/([^/]+)\/study$/.exec(path)) && method === "GET") {
    const rid = m[1] === "me" ? user.researcherId : m[1]
    if (m[1] === "me" && user.researcherId === null) return err("400.context-substitution-failed")
    return ok(state.studies[rid ?? ""] ?? [])
  }
  if (path === "/researcher" && method === "GET") return ok(state.researchers)
  if ((m = /^\/study\/([^/]+)\/activity$/.exec(path))) {
    const sid = m[1]
    if (method === "GET") {
      const ignore = u.searchParams.get("ignore_binary") === "true"
      return ok(Object.values(state.activities).filter((a) => a.study === sid).map(({ study: _s, settings, ...a }) => (ignore ? a : { ...a, settings })))
    }
    if (method === "POST") {
      const b = body as Partial<FakeActivity>
      const id = `act${state.nextId++}`
      state.activities[id] = { id, name: b.name ?? "", spec: b.spec ?? "", settings: b.settings ?? {}, schedule: b.schedule ?? [], category: b.category ?? null, study: sid }
      return ok(id)
    }
  }
  if ((m = /^\/activity\/([^/]+)$/.exec(path))) {
    const a = state.activities[m[1]]
    if (!a) return err("404.not-found")
    if (method === "GET") {
      const { study: _s, ...rest } = a
      return ok([structuredClone(rest)])
    }
    if (method === "PUT") {
      const b = body as Partial<FakeActivity>
      a.name = b.name ?? a.name
      a.settings = b.settings ?? a.settings
      a.category = b.category ?? a.category
      a.schedule = b.schedule ?? a.schedule
      return ok({})
    }
  }
  if ((m = /^\/type\/([^/]+)\/attachment\/([^/]+)(?:\/([^/]+))?$/.exec(path))) {
    const key = `${m[1]}|${m[2]}`
    if (method === "GET") return key in state.attachments ? ok(structuredClone(state.attachments[key])) : err("404.not-found")
    if (method === "PUT") {
      if (state.failAttachmentWrites) return ok(null)
      state.attachments[key] = structuredClone(body)
      return ok({})
    }
  }
  return { status: 404, body: { message: "404.api-endpoint-unimplemented" } }
}

/** fetch() implementation backed by the fake server (Vitest). */
export function fakeFetch(state: FakeState): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    const headers = new Headers(init?.headers)
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined
    const r = handleFake(state, init?.method ?? "GET", url, headers.get("Authorization"), body)
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } })
  }) as typeof fetch
}
