import { beforeEach, describe, expect, it, vi } from "vitest"
import { createLampClient, isInsecureUrl, normalizeServerUrl, LampApiError } from "@/builder/server/lampApi"
import { bumpVersion, diffSurveys } from "@/builder/diff"
import { parseSurveyJson, validateSurvey } from "@/builder/validate"
import { getL, setL, slugId } from "@/builder/lstring"
import { emptySurvey, useBuilder } from "@/builder/store"
import { analyseImport } from "@/builder/ImportExport"
import { encodeDashboardFile, makeDashboardActivity } from "@/survey/dashboardFile"
import type { SurveyDefinition } from "@/survey/schema"
import { TEMPLATES } from "@/templates"

const med = () => JSON.parse(JSON.stringify(TEMPLATES.find((t) => t.id === "medication")!.survey)) as SurveyDefinition

function fakeFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} })
    const r = responses.shift() ?? { body: { data: null } }
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { "Content-Type": "application/json" } })
  })
  return { fn, calls }
}

describe("LAMP API client", () => {
  it("sends Basic auth and the exact routes", async () => {
    const { fn, calls } = fakeFetch([
      { body: { data: [{ id: "s1", name: "Study" }] } },
      { body: { data: [{ id: "a1", name: "Old", spec: "lamp.survey" }, { id: "a2", name: "New", spec: "lamp.survey_new" }] } },
      { body: { data: [{ id: "a2", name: "New", spec: "lamp.survey_new", settings: { schemaVersion: 1, questions: [] } }] } },
      { body: { data: {} } },
      { body: { data: "a3" } },
    ])
    const c = createLampClient({ serverUrl: "api.example.org/", username: "rés@x.org", password: "p:w" }, fn)
    expect(await c.listMyStudies()).toEqual([{ id: "s1", name: "Study" }])
    expect(await c.listSurveys("s1")).toEqual([{ id: "a2", name: "New", spec: "lamp.survey_new" }])
    expect((await c.getActivity("a2")).name).toBe("New")
    await c.updateSettings("a2", { schemaVersion: 1, questions: [] })
    expect(await c.createActivity("s1", { name: "X", settings: { q: 1 } })).toBe("a3")

    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      "GET https://api.example.org/researcher/me/study",
      "GET https://api.example.org/study/s1/activity?ignore_binary=true",
      "GET https://api.example.org/activity/a2",
      "PUT https://api.example.org/activity/a2",
      "POST https://api.example.org/study/s1/activity",
    ])
    const auth = (calls[0].init.headers as Record<string, string>).Authorization
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(auth.replace("Basic ", "")), (ch) => ch.charCodeAt(0)))
    expect(decoded).toBe("rés@x.org:p:w")
    // Publish sends ONLY settings, so the server keeps name/schedule/notification ids.
    expect(JSON.parse(String(calls[3].init.body))).toEqual({ settings: { schemaVersion: 1, questions: [] } })
    expect(JSON.parse(String(calls[4].init.body))).toEqual({ name: "X", spec: "lamp.survey_new", schedule: [], settings: { q: 1 }, category: ["assess"] })
  })

  it("maps errors to readable messages and codes", async () => {
    const { fn } = fakeFetch([
      { status: 401, body: { error: "401.missing-credentials" } },
      { status: 400, body: { error: "400.context-substitution-failed" } },
      { status: 403, body: { error: "403.security-context-out-of-scope" } },
    ])
    const c = createLampClient({ serverUrl: "https://x", username: "a", password: "b" }, fn)
    await expect(c.listMyStudies()).rejects.toThrow("The email or password was not accepted.")
    await expect(c.listMyStudies()).rejects.toMatchObject({ code: "400.context-substitution-failed" })
    await expect(c.getActivity("z")).rejects.toThrow("doesn't have access")
    const offline = createLampClient({ serverUrl: "https://x", username: "a", password: "b" }, () => Promise.reject(new TypeError("Failed to fetch")))
    await expect(offline.listMyStudies()).rejects.toBeInstanceOf(LampApiError)
    await expect(offline.listMyStudies()).rejects.toThrow("Couldn't reach the server")
  })

  it("attachments: missing history is null; a failed write throws", async () => {
    const { fn, calls } = fakeFetch([{ status: 404, body: { error: "404.not-found" } }, { body: { data: null } }, { body: { data: {} } }])
    const c = createLampClient({ serverUrl: "https://x", username: "a", password: "b" }, fn)
    expect(await c.getAttachment("a1", "lamp.survey_new.history")).toBeNull()
    await expect(c.setAttachment("a1", "k", { v: 1 })).rejects.toThrow("could not save")
    await c.setAttachment("a1", "k", { v: 1 })
    expect(calls[2].url).toBe("https://x/type/a1/attachment/k/me")
  })

  it("server URL helpers", () => {
    expect(normalizeServerUrl(" https://api.x.org/// ")).toBe("https://api.x.org")
    expect(isInsecureUrl("http://api.x.org")).toBe(true)
    expect(isInsecureUrl("http://localhost:3000")).toBe(false)
    expect(isInsecureUrl("https://api.x.org")).toBe(false)
  })
})

describe("diffSurveys", () => {
  it("classifies additions, edits and breaking changes", () => {
    const a = med()
    const b = med()
    b.questions = b.questions.filter((q) => q.id !== "wellbeing")
    const reason = b.questions.find((q) => q.id === "missed_reason")!
    if (reason.type === "single") reason.options = reason.options.filter((o) => o.value !== "ran_out")
    const time = b.questions.find((q) => q.id === "dose_time")!
    time.text = { en: "What time?", fr: "À quelle heure ?" }
    b.questions.push({ id: "extra", type: "short", text: "New" })
    const d = diffSurveys(a, b)
    expect(d.added).toEqual(["extra"])
    expect(d.removed).toEqual(["wellbeing"])
    expect(d.changed.find((c) => c.id === "dose_time")?.what).toContain("text")
    expect(d.breaking.map((x) => x.id).sort()).toEqual(["dose_time", "missed_reason", "wellbeing"])
    expect(diffSurveys(a, med()).identical).toBe(true)
  })
  it("bumps versions", () => {
    expect(bumpVersion(undefined)).toBe("1")
    expect(bumpVersion("3")).toBe("4")
    expect(bumpVersion("1.9")).toBe("1.10")
    expect(bumpVersion("v2")).toBe("v3")
  })
})

describe("validateSurvey", () => {
  it("passes the templates (no errors)", () => {
    for (const t of TEMPLATES) expect(validateSurvey(t.survey).filter((i) => i.level === "error")).toEqual([])
  })
  it("flags forward references, duplicates, empty options and missing translations", () => {
    const s: SurveyDefinition = {
      schemaVersion: 1,
      defaultLanguage: "en",
      languages: ["en", "fr"],
      questions: [
        { id: "a", type: "boolean", text: { en: "A", fr: "A fr" }, showIf: { question: "b", op: "eq", value: "Yes" } },
        { id: "b", type: "single", text: "B", options: [] },
        { id: "b", type: "multiple", text: "", options: [{ value: "x" }, { value: "x" }], minSelected: 3, maxSelected: 1 },
        { id: "r", type: "rating", text: "R", min: 0, max: 30 },
      ],
      scores: [{ id: "s", method: "sum", questions: ["zzz"] }],
      alerts: [{ id: "al", when: { score: "nope", op: "gte", value: 1 }, message: "", severity: "info", timing: "submit" }],
    }
    const msgs = validateSurvey(s).map((i) => `${i.level}:${i.message}`)
    const has = (re: RegExp) => expect(msgs.some((m) => re.test(m))).toBe(true)
    has(/error:Show-if: .*comes later/)
    has(/error:.*used more than once/)
    has(/error:.*has no options/)
    has(/error:.*duplicate option values: x/)
    has(/error:.*minimum selections is more than the maximum/)
    has(/error:.*at most 21 points/)
    has(/error:Score "s" uses "zzz"/)
    has(/error:Alert "al" has no message/)
    has(/error:Alert "al": .*score "nope"/)
    has(/warning:.*not translated into "fr"/)
  })
  it("parseSurveyJson explains why JSON isn't a survey", () => {
    expect(parseSurveyJson({ schemaVersion: 1, questions: [] }).survey).toBeTruthy()
    expect(parseSurveyJson({ questions: "nope" }).errors.length).toBeGreaterThan(0)
  })
})

describe("translatable text helpers", () => {
  it("keeps single-language surveys as plain strings, multi-language as maps", () => {
    expect(setL("Hi", "en", "en", "Hello", false)).toBe("Hello")
    expect(setL("Hi", "fr", "en", "Salut", true)).toEqual({ en: "Hi", fr: "Salut" })
    expect(setL({ en: "Hi", fr: "Salut" }, "fr", "en", "", true)).toEqual({ en: "Hi" })
    expect(getL({ en: "Hi" }, "fr", "en")).toBe("")
    expect(getL("Hi", "en", "en")).toBe("Hi")
    expect(slugId("Did you sleep well last night?")).toBe("did_you_sleep_well")
    expect(slugId("123")).toBe("q_123")
  })
})

describe("builder store", () => {
  beforeEach(() => useBuilder.getState().load(med(), { name: "Med" }))

  it("renaming a question updates logic, piping, scores and alerts", () => {
    const st = useBuilder.getState()
    st.change((s) => ({
      ...s,
      scores: [{ id: "t", method: "sum", questions: ["dose_taken"] }],
      alerts: [{ id: "x", when: { question: "dose_taken", op: "eq", value: "No" }, message: "{{dose_taken}}", severity: "info", timing: "submit" }],
    }))
    useBuilder.getState().renameQuestion("dose_taken", "took_dose")
    const s = useBuilder.getState().survey
    expect(s.questions[0].id).toBe("took_dose")
    expect(s.questions[1].showIf).toEqual({ question: "took_dose", op: "eq", value: "Yes" })
    expect(s.scores![0].questions).toEqual(["took_dose"])
    expect(s.alerts![0].when).toEqual({ question: "took_dose", op: "eq", value: "No" })
    useBuilder.getState().renameQuestion("dose_time", "when")
    const se = useBuilder.getState().survey.questions.find((q) => q.id === "side_effects")!
    expect(JSON.stringify(se.text)).toContain("{{when}}")
  })

  it("add / duplicate / move / remove with undo and redo; rapid edits coalesce", () => {
    const st = useBuilder.getState()
    const n = st.survey.questions.length
    const id = st.addQuestion("number", "dose_taken")
    expect(useBuilder.getState().survey.questions[1].id).toBe(id)
    useBuilder.getState().duplicateQuestion(id)
    expect(useBuilder.getState().survey.questions).toHaveLength(n + 2)
    useBuilder.getState().undo()
    useBuilder.getState().undo()
    expect(useBuilder.getState().survey.questions).toHaveLength(n)
    useBuilder.getState().redo()
    expect(useBuilder.getState().survey.questions).toHaveLength(n + 1)
    const before = useBuilder.getState().past.length
    for (const t of ["a", "ab", "abc"]) useBuilder.getState().updateQuestion(id, { text: t }, `${id}.text`)
    expect(useBuilder.getState().past.length).toBe(before + 1)
    useBuilder.getState().moveQuestion(1, 0)
    expect(useBuilder.getState().survey.questions[0].id).toBe(id)
    useBuilder.getState().removeQuestion(id)
    expect(useBuilder.getState().survey.questions.some((q) => q.id === id)).toBe(false)
  })

  it("changing type keeps text and logic", () => {
    useBuilder.getState().changeType("dose_time", "short")
    const q = useBuilder.getState().survey.questions.find((x) => x.id === "dose_time")!
    expect(q.type).toBe("short")
    expect(q.showIf).toBeTruthy()
  })

  it("emptySurvey is valid JSON for the runtime", () => {
    expect(parseSurveyJson(emptySurvey()).survey).toBeTruthy()
  })
})

describe("import analysis", () => {
  it("recognises dashboard exports (new + classic surveys) and plain survey files", () => {
    const file = encodeDashboardFile([
      makeDashboardActivity(med(), { name: "Med" }),
      { name: "Classic", spec: "lamp.survey", schedule: [], settings: [{ text: "Q?", type: "boolean" }] },
      { name: "Game", spec: "lamp.jewels_a", schedule: [], settings: {} },
    ])
    const c = analyseImport(file)
    expect(c.map((x) => [x.label, x.kind, !!x.survey])).toEqual([
      ["Med", "survey", true],
      ["Classic", "legacy", true],
      ["Game", "other", false],
    ])
    expect(analyseImport(JSON.stringify(med()))[0].survey?.questions).toHaveLength(5)
    expect(analyseImport("garbage!!")[0].errors.length).toBe(1)
  })
})
