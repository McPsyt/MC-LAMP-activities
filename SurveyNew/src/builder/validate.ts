/**
 * Builder validation: structural (zod, for imported JSON) + semantic checks researchers can act on.
 * Errors block export/publish; warnings don't.
 */
import { z } from "zod"
import type { Condition, LString, Question, SurveyDefinition } from "@/survey/schema"
import { ID_PATTERN, OTHER_VALUE, QUESTION_TYPES, isDisplayItem } from "@/survey/schema"
import { isQuestionRule, isScoreRule } from "@/survey/conditions"
import { pipedKeys } from "@/survey/piping"
import { hasTranslation } from "@/survey/i18n"
import { getDefaultL, isEmptyL } from "./lstring"

export interface Issue {
  level: "error" | "warning"
  message: string
  questionId?: string
  /** Where to fix it: "question" (default), "scores", "alerts", "settings", "languages". */
  area?: "question" | "scores" | "alerts" | "settings" | "languages"
}

// ---- structural schema (lenient: unknown keys allowed) ------------------------------

const lstring = z.union([z.string(), z.record(z.string(), z.string())])
const condition: z.ZodType<Condition> = z.lazy(() =>
  z.union([
    z.object({ all: z.array(condition) }),
    z.object({ any: z.array(condition) }),
    z.object({ not: condition }),
    z.object({ question: z.string(), op: z.string(), value: z.unknown().optional() }),
    z.object({ score: z.string(), op: z.string(), value: z.number().optional() }),
  ]),
) as unknown as z.ZodType<Condition>

const questionSchema = z.looseObject({
  id: z.string(),
  type: z.enum(QUESTION_TYPES),
  text: lstring,
  description: lstring.optional(),
  required: z.boolean().optional(),
  showIf: condition.optional(),
  endSurveyIf: condition.optional(),
})

export const surveySchema = z.looseObject({
  schemaVersion: z.literal(1),
  questions: z.array(questionSchema),
  defaultLanguage: z.string().optional(),
  languages: z.array(z.string()).optional(),
  scores: z
    .array(z.looseObject({ id: z.string(), method: z.enum(["sum", "mean", "count"]), questions: z.array(z.string()) }))
    .optional(),
  alerts: z
    .array(
      z.looseObject({
        id: z.string(),
        when: condition,
        message: lstring,
        severity: z.enum(["info", "warning", "critical"]),
        timing: z.enum(["immediate", "submit"]),
      }),
    )
    .optional(),
})

/** Parse imported JSON into a survey definition, or explain why it isn't one. */
export function parseSurveyJson(value: unknown): { survey?: SurveyDefinition; errors: string[] } {
  const r = surveySchema.safeParse(value)
  if (r.success) return { survey: r.data as unknown as SurveyDefinition, errors: [] }
  return {
    errors: r.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  }
}

// ---- semantic validation ------------------------------------------------------------

const VALUE_OPS = new Set(["eq", "neq", "in", "notIn", "contains", "notContains", "gt", "gte", "lt", "lte"])

function answerKeysOf(q: Question): string[] {
  if (isDisplayItem(q)) return []
  if (q.type === "matrix") return [q.id, ...q.rows.map((r) => `${q.id}.${r.id}`)]
  const keys = [q.id]
  if ((q.type === "single" || q.type === "dropdown" || q.type === "multiple") && q.allowOther) keys.push(`${q.id}.other`)
  return keys
}

function checkCondition(
  c: Condition,
  allowed: Set<string>,
  known: Set<string>,
  scores: Set<string>,
  push: (msg: string) => void,
) {
  if ("all" in c) return c.all.forEach((x) => checkCondition(x, allowed, known, scores, push))
  if ("any" in c) return c.any.forEach((x) => checkCondition(x, allowed, known, scores, push))
  if ("not" in c) return checkCondition(c.not, allowed, known, scores, push)
  if (isQuestionRule(c)) {
    if (!c.question) return push("A rule has no question selected.")
    if (!known.has(c.question)) return push(`A rule refers to "${c.question}", which doesn't exist.`)
    if (!allowed.has(c.question)) return push(`A rule refers to "${c.question}", which comes later in the survey. Rules can only use earlier answers.`)
    if (VALUE_OPS.has(c.op) && (c.value === undefined || c.value === "" || (Array.isArray(c.value) && c.value.length === 0))) {
      push(`A rule on "${c.question}" has no value to compare with.`)
    }
    return
  }
  if (isScoreRule(c)) {
    if (!scores.has(c.score)) push(`A rule refers to score "${c.score}", which doesn't exist.`)
    else if (VALUE_OPS.has(c.op) && typeof c.value !== "number") push(`A rule on score "${c.score}" needs a number.`)
  }
}

function dupes<T>(items: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const i of items) {
    const k = String(i)
    if (seen.has(k)) out.push(i)
    seen.add(k)
  }
  return out
}

export function validateSurvey(s: SurveyDefinition): Issue[] {
  const issues: Issue[] = []
  const defLang = s.defaultLanguage ?? "en"
  const langs = (s.languages ?? [defLang]).filter((l) => l !== defLang)
  const known = new Set(s.questions.flatMap(answerKeysOf))
  const scoreIds = new Set((s.scores ?? []).map((x) => x.id))
  const idCounts = new Map<string, number>()
  s.questions.forEach((q) => idCounts.set(q.id, (idCounts.get(q.id) ?? 0) + 1))

  if (!s.questions.some((q) => !isDisplayItem(q))) issues.push({ level: "warning", message: "The survey has no questions yet.", area: "settings" })

  const allowed = new Set<string>()
  const missingTranslations = new Map<string, number>()
  const checkLang = (text: LString | undefined) => {
    if (isEmptyL(text)) return
    for (const l of langs) if (!hasTranslation(text, l, defLang)) missingTranslations.set(l, (missingTranslations.get(l) ?? 0) + 1)
  }

  for (const q of s.questions) {
    const add = (level: Issue["level"], message: string) => issues.push({ level, message, questionId: q.id, area: "question" })
    const label = `"${getDefaultL(q.text, defLang).slice(0, 40) || q.id}"`

    if (!ID_PATTERN.test(q.id)) add("error", `Question id "${q.id}" must start with a letter and use only letters, digits and _.`)
    if ((idCounts.get(q.id) ?? 0) > 1) add("error", `Question id "${q.id}" is used more than once.`)
    if (isEmptyL(q.text)) add("error", q.type === "info" ? "Information block has no text." : `Question ${q.id} has no text.`)
    checkLang(q.text)
    checkLang(q.description)

    if (q.showIf) checkCondition(q.showIf, allowed, known, scoreIds, (m) => add("error", `Show-if: ${m}`))
    if (q.endSurveyIf) {
      const self = new Set([...allowed, ...answerKeysOf(q)])
      checkCondition(q.endSurveyIf, self, known, scoreIds, (m) => add("error", `End-survey rule: ${m}`))
    }

    for (const t of [getDefaultL(q.text, defLang), getDefaultL(q.description, defLang)]) {
      for (const k of pipedKeys(t)) {
        if (!known.has(k)) add("warning", `Text inserts {{${k}}}, which isn't a question id.`)
        else if (!allowed.has(k)) add("warning", `Text inserts {{${k}}}, which is answered later, so it will be blank.`)
      }
    }

    switch (q.type) {
      case "single":
      case "dropdown":
      case "multiple":
      case "ranking": {
        if (q.options.length === 0) add("error", `${label} has no options.`)
        else if (q.options.length === 1 && q.type !== "multiple") add("warning", `${label} has only one option.`)
        if (q.options.some((o) => o.value === "" || o.value == null)) add("error", `${label} has an option without a value.`)
        const d = dupes(q.options.map((o) => o.value))
        if (d.length) add("error", `${label} has duplicate option values: ${d.join(", ")}.`)
        if ("allowOther" in q && q.allowOther && q.options.some((o) => o.value === OTHER_VALUE)) {
          add("error", `${label}: the value "other" is reserved for the "Other" option.`)
        }
        q.options.forEach((o) => {
          checkLang(o.label)
          checkLang(o.description)
        })
        if (q.type === "multiple") {
          if (q.minSelected && q.maxSelected && q.minSelected > q.maxSelected) add("error", `${label}: minimum selections is more than the maximum.`)
          if (q.maxSelected && q.maxSelected > q.options.length + (q.allowOther ? 1 : 0)) add("warning", `${label}: maximum selections is more than the number of options.`)
        }
        break
      }
      case "likert":
      case "matrix": {
        if (q.options && q.options.length > 0) {
          if (q.options.length < 2) add("error", `${label} needs at least 2 scale points.`)
          const d = dupes(q.options.map((o) => o.value))
          if (d.length) add("error", `${label} has duplicate scale values: ${d.join(", ")}.`)
          q.options.forEach((o) => checkLang(o.label))
        }
        if (q.type === "matrix") {
          if (q.rows.length === 0) add("error", `${label} has no rows.`)
          const d = dupes(q.rows.map((r) => r.id))
          if (d.length) add("error", `${label} has duplicate row ids: ${d.join(", ")}.`)
          if (q.rows.some((r) => !ID_PATTERN.test(r.id))) add("error", `${label} has a row id that isn't valid.`)
          if (q.rows.some((r) => isEmptyL(r.text))) add("error", `${label} has a row without text.`)
          q.rows.forEach((r) => checkLang(r.text))
        }
        break
      }
      case "slider":
        if (!(q.max > q.min)) add("error", `${label}: maximum must be greater than minimum.`)
        if (q.step !== undefined && !(q.step > 0)) add("error", `${label}: step must be greater than 0.`)
        else if ((q.max - q.min) / (q.step ?? 1) > 1000) add("warning", `${label}: more than 1000 steps; consider a larger step.`)
        break
      case "rating":
        if (!(q.max > q.min)) add("error", `${label}: maximum must be greater than minimum.`)
        else if (q.max - q.min > 20) add("error", `${label}: at most 21 points; use a slider for wider ranges.`)
        else if (q.max - q.min > 11) add("warning", `${label}: more than 12 buttons is hard to use on phones.`)
        break
      case "number":
        if (q.min != null && q.max != null && q.min > q.max) add("error", `${label}: minimum is greater than maximum.`)
        break
      case "duration":
        if (q.maxHours != null && q.maxHours <= 0) add("error", `${label}: maximum hours must be more than 0.`)
        break
    }

    for (const k of answerKeysOf(q)) allowed.add(k)
  }

  const scoreDupes = dupes((s.scores ?? []).map((x) => x.id))
  if (scoreDupes.length) issues.push({ level: "error", message: `Duplicate score ids: ${scoreDupes.join(", ")}.`, area: "scores" })
  for (const sc of s.scores ?? []) {
    if (!ID_PATTERN.test(sc.id)) issues.push({ level: "error", message: `Score id "${sc.id}" isn't valid.`, area: "scores" })
    if (sc.questions.length === 0) issues.push({ level: "error", message: `Score "${sc.id}" has no questions.`, area: "scores" })
    for (const r of sc.questions) {
      if (!known.has(r)) issues.push({ level: "error", message: `Score "${sc.id}" uses "${r}", which doesn't exist.`, area: "scores" })
    }
  }

  const alertDupes = dupes((s.alerts ?? []).map((x) => x.id))
  if (alertDupes.length) issues.push({ level: "error", message: `Duplicate alert ids: ${alertDupes.join(", ")}.`, area: "alerts" })
  for (const a of s.alerts ?? []) {
    if (isEmptyL(a.message)) issues.push({ level: "error", message: `Alert "${a.id}" has no message.`, area: "alerts" })
    checkCondition(a.when, known, known, scoreIds, (m) => issues.push({ level: "error", message: `Alert "${a.id}": ${m}`, area: "alerts" }))
    checkLang(a.message)
    checkLang(a.title)
  }

  checkLang(s.title)
  for (const [l, n] of missingTranslations) {
    issues.push({ level: "warning", message: `${n} text${n === 1 ? "" : "s"} not translated into "${l}" (the default language is shown instead).`, area: "languages" })
  }
  return issues
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.level === "error")
