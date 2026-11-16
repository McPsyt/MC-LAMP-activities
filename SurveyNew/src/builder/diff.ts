/**
 * Compare two survey versions for the Publish dialog.
 * "Breaking" = changes that make new results hard to line up with earlier ones.
 */
import type { Question, SurveyDefinition } from "@/survey/schema"
import { isDisplayItem } from "@/survey/schema"
import { getOptions } from "@/survey/options"
import { stableStringify } from "@/survey/hash"
import { getDefaultL } from "./lstring"

export interface SurveyDiff {
  added: string[]
  removed: string[]
  changed: Array<{ id: string; what: string[] }>
  breaking: Array<{ id: string; reason: string }>
  settingsChanged: string[]
  identical: boolean
}

const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b)

function optionValues(q: Question): string[] {
  return getOptions(q).map((o) => String(o.value))
}

export function diffSurveys(before: SurveyDefinition | null | undefined, after: SurveyDefinition): SurveyDiff {
  const prev = new Map((before?.questions ?? []).map((q) => [q.id, q]))
  const next = new Map(after.questions.map((q) => [q.id, q]))
  const out: SurveyDiff = { added: [], removed: [], changed: [], breaking: [], settingsChanged: [], identical: false }
  const lang = after.defaultLanguage ?? "en"

  for (const id of next.keys()) if (!prev.has(id)) out.added.push(id)
  for (const [id, q] of prev) {
    if (!next.has(id)) {
      out.removed.push(id)
      if (!isDisplayItem(q)) out.breaking.push({ id, reason: "question removed (past answers keep this id; new results won't have it)" })
    }
  }

  for (const [id, b] of next) {
    const a = prev.get(id)
    if (!a) continue
    const what: string[] = []
    if (a.type !== b.type) {
      what.push(`type ${a.type} -> ${b.type}`)
      out.breaking.push({ id, reason: `answer type changed from ${a.type} to ${b.type}` })
    }
    if (!same(a.text, b.text)) {
      what.push("text")
      if (!isDisplayItem(b) && getDefaultL(a.text, lang) !== getDefaultL(b.text, lang)) {
        out.breaking.push({ id, reason: "question text changed (dashboards match results by text; use static_data.answers by id)" })
      }
    }
    if (!same(a.description, b.description)) what.push("description")
    if (!same(a.required, b.required)) what.push("required")
    if (!same(a.showIf, b.showIf)) what.push("show-if logic")
    if (!same(a.endSurveyIf, b.endSurveyIf)) what.push("end-survey logic")
    if (a.type === b.type) {
      const av = optionValues(a)
      const bv = optionValues(b)
      const lost = av.filter((v) => !bv.includes(v))
      if (lost.length) out.breaking.push({ id, reason: `option value(s) removed or renamed: ${lost.join(", ")}` })
      if (a.type === "matrix" && b.type === "matrix") {
        const rowsLost = a.rows.map((r) => r.id).filter((r) => !b.rows.some((x) => x.id === r))
        if (rowsLost.length) out.breaking.push({ id, reason: `grid row(s) removed: ${rowsLost.join(", ")}` })
      }
      const rest = (q: Question) => {
        const { id: _i, type: _t, text: _x, description: _d, required: _r, showIf: _s, endSurveyIf: _e, ...r } = q as Question & Record<string, unknown>
        return r
      }
      if (!same(rest(a), rest(b))) what.push("settings/options")
    }
    if (what.length) out.changed.push({ id, what })
  }

  const order = (s: SurveyDefinition | null | undefined) => (s?.questions ?? []).map((q) => q.id).join(",")
  if (before && order(before) !== order(after) && !out.added.length && !out.removed.length) out.settingsChanged.push("question order")
  for (const key of ["title", "options", "appearance", "intro", "completion", "scores", "alerts", "languages", "defaultLanguage"] as const) {
    if (!same(before?.[key], after[key])) out.settingsChanged.push(key)
  }
  out.identical = !!before && same({ ...before, version: undefined }, { ...after, version: undefined })
  return out
}

/** Increment a version string: "3" -> "4", "1.2" -> "1.3", "" -> "1". */
export function bumpVersion(v: string | undefined): string {
  if (!v) return "1"
  const m = /^(.*?)(\d+)$/.exec(v.trim())
  return m ? `${m[1]}${Number(m[2]) + 1}` : `${v}.1`
}
