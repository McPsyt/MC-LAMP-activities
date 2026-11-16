import { describe, expect, it } from "vitest"
import legacyFixture from "../fixtures/legacy-demo-surveys.json"
import { convertLegacySurvey, looksLikeLegacySettings } from "@/survey/legacy"
import { normalizeSurvey, SurveyError } from "@/survey/normalize"
import { decodeDashboardFile, encodeDashboardFile, makeDashboardActivity } from "@/survey/dashboardFile"
import { makeTranslator, resolveText, resolveUiLanguage } from "@/survey/i18n"
import { TEMPLATES } from "@/templates"

describe("legacy lamp.survey conversion", () => {
  it("converts the dashboard demo survey", () => {
    // Copied from MC-LAMP-dashboard/src/demo_db.json (lamp.survey activities).
    const legacy = legacyFixture as Array<{ spec: string; settings: unknown; name: string }>
    expect(legacy.length).toBeGreaterThan(0)
    for (const a of legacy) {
      // demo_db stores bare option values (unspliced); wrap like spliceActivity does.
      const settings = (a.settings as Array<Record<string, unknown>>).map((q) => ({
        ...q,
        options: Array.isArray(q.options) && q.type !== "matrix" && q.type !== "time" ? q.options.map((v) => ({ value: v })) : q.options,
      }))
      const { survey } = convertLegacySurvey(settings as never, a.name)
      const n = normalizeSurvey(survey)
      expect(n.questions.length).toBeGreaterThan(0)
    }
  })

  it("maps types, matrix runs and warnings", () => {
    const { survey, notes } = convertLegacySurvey([
      { text: "Mood", type: "likert", required: true },
      { text: "Sleep well?", type: "boolean", warnings: [{ answer: '"No"', warningText: "Talk to us" }] },
      { text: "Row A", type: "list", description: "Grid prompt", options: [{ value: "Never" }, { value: "Often" }] },
      { text: "Row B", type: "matrix" },
      { text: "Pick", type: "multiselect", options: [{ value: "x", description: "ex" }] },
      { text: "When", type: "time", options: [{ value: "military" }] },
      { text: "Pain", type: "slider", options: [{ value: 0, description: "none" }, { value: 5 }, { value: 10, description: "max" }] },
      { text: "Weird", type: "audio" },
    ])
    const types = survey.questions.map((q) => q.type)
    expect(types).toEqual(["likert", "boolean", "matrix", "multiple", "time", "slider"])
    const grid = survey.questions[2]
    expect(grid.type === "matrix" && grid.rows.map((r) => r.text)).toEqual(["Row A", "Row B"])
    expect(grid.text).toBe("Grid prompt")
    const slider = survey.questions[5]
    expect(slider.type === "slider" && [slider.min, slider.max, slider.step, slider.minLabel, slider.maxLabel]).toEqual([0, 10, 5, "none", "max"])
    expect(survey.alerts?.[0]).toMatchObject({ when: { question: "q2", op: "eq", value: "No" }, message: "Talk to us" })
    expect(notes.some((n) => n.includes("unsupported"))).toBe(true)
  })

  it("runtime accepts legacy arrays", () => {
    const legacy = [{ text: "A", type: "boolean" }]
    expect(looksLikeLegacySettings(legacy)).toBe(true)
    expect(normalizeSurvey(legacy).questions[0].type).toBe("boolean")
  })
})

describe("normalizeSurvey", () => {
  it("rejects missing settings and fills defaults", () => {
    expect(() => normalizeSurvey(undefined)).toThrow(SurveyError)
    expect(() => normalizeSurvey({})).toThrow(SurveyError)
    expect(() => normalizeSurvey({ foo: 1 })).toThrow(SurveyError)
    const s = normalizeSurvey({ schemaVersion: 1, questions: [{ type: "short", text: "x" }, { id: "q1", type: "nope" }, { id: "q1", type: "short", text: "y" }] })
    expect(s.questions.map((q) => q.id)).toEqual(["q1", "q1_2"])
    expect(s.options.layout).toBe("question")
    expect(s.appearance.theme).toBe("zinc")
  })
  it("every bundled template is valid", () => {
    for (const t of TEMPLATES) expect(normalizeSurvey(t.survey).questions.length).toBeGreaterThan(0)
  })
})

describe("dashboard import/export file", () => {
  it("round-trips through the dashboard's exact decode expression, with non-ASCII text", () => {
    const survey = TEMPLATES[0].survey
    const file = encodeDashboardFile([makeDashboardActivity(survey, { name: "Médication ✓ 用药" })])
    // ImportActivity.tsx: JSON.parse(decodeURIComponent(escape(atob(reader.result))))
    const dashboardDecoded = JSON.parse(decodeURIComponent(escape(atob(file))))
    expect(dashboardDecoded[0].name).toBe("Médication ✓ 用药")
    expect(dashboardDecoded[0].spec).toBe("lamp.survey_new")
    // ImportActivity's acceptance filter
    expect(dashboardDecoded.filter((x: Record<string, unknown>) => !!x.name && !!x.settings && !!x.schedule)).toHaveLength(1)
    expect(decodeDashboardFile(file)).toEqual(dashboardDecoded)
    // ExportActivity.tsx: btoa(unescape(encodeURIComponent(JSON.stringify(data))))
    const dashboardEncoded = btoa(unescape(encodeURIComponent(JSON.stringify(dashboardDecoded))))
    expect(decodeDashboardFile(dashboardEncoded)).toEqual(dashboardDecoded)
  })
  it("also accepts plain JSON", () => {
    expect(decodeDashboardFile('[{"a":1}]')).toEqual([{ a: 1 }])
  })
})

describe("i18n", () => {
  it("maps dashboard language codes", () => {
    expect(resolveUiLanguage("fr-FR")).toBe("fr")
    expect(resolveUiLanguage("zh-HK")).toBe("zh-HK")
    expect(resolveUiLanguage("zh-TW")).toBe("zh-HK")
    expect(resolveUiLanguage("zh-CN")).toBe("zh-CN")
    expect(resolveUiLanguage("xx-YY")).toBe("en")
    expect(makeTranslator("de-DE")("next")).toBe("Weiter")
    expect(makeTranslator("ko-KR")("questionNofM", { n: 1, m: 3 })).toBe("질문 1/3")
  })
  it("resolves translated content with fallbacks", () => {
    const s = { en: "Hello", fr: "Bonjour", "zh-HK": "你好" }
    expect(resolveText(s, "fr-CA")).toBe("Bonjour")
    expect(resolveText(s, "zh-TW")).toBe("你好")
    expect(resolveText(s, "de", "en")).toBe("Hello")
    expect(resolveText("plain", "fr")).toBe("plain")
    expect(resolveText({ fr: "" , en: "E" }, "fr", "en")).toBe("E")
  })
})
