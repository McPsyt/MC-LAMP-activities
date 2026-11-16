import type { ChoiceOption, LikertPreset, OptionValue, Question } from "./schema"
import { OTHER_VALUE } from "./schema"
import type { Translator, UiKey } from "./i18n"
import { makeTranslator } from "./i18n"

const PRESETS: Record<LikertPreset, Array<[number, UiKey]>> = {
  agree5: [
    [1, "agreeSD"],
    [2, "agreeD"],
    [3, "agreeN"],
    [4, "agreeA"],
    [5, "agreeSA"],
  ],
  agree7: [
    [1, "agreeSD"],
    [2, "agreeD"],
    [3, "agreeSWD"],
    [4, "agreeN"],
    [5, "agreeSWA"],
    [6, "agreeA"],
    [7, "agreeSA"],
  ],
  frequency4: [
    [0, "freq4_0"],
    [1, "freq4_1"],
    [2, "freq4_2"],
    [3, "freq4_3"],
  ],
  frequency5: [
    [0, "freq5_0"],
    [1, "freq5_1"],
    [2, "freq5_2"],
    [3, "freq5_3"],
    [4, "freq5_4"],
  ],
  satisfaction5: [
    [1, "sat1"],
    [2, "sat2"],
    [3, "sat3"],
    [4, "sat4"],
    [5, "sat5"],
  ],
}

export const PRESET_LABELS: Record<LikertPreset, string> = {
  agree5: "Agreement (5-point)",
  agree7: "Agreement (7-point)",
  frequency4: "Frequency, PHQ/GAD style (0-3)",
  frequency5: "Frequency (Never-Always, 0-4)",
  satisfaction5: "Satisfaction (5-point)",
}

export function presetOptions(preset: LikertPreset, t: Translator): ChoiceOption[] {
  return (PRESETS[preset] ?? PRESETS.agree5).map(([value, key]) => ({ value, label: t(key) }))
}

const FACE_KEYS: Record<3 | 5 | 7, UiKey[]> = {
  3: ["faceBad", "faceOkay", "faceGood"],
  5: ["faceVeryBad", "faceBad", "faceOkay", "faceGood", "faceVeryGood"],
  7: ["faceTerrible", "faceVeryBad", "faceBad", "faceOkay", "faceGood", "faceVeryGood", "faceExcellent"],
}

export function faceCount(q: { count?: number }): 3 | 5 | 7 {
  return q.count === 3 || q.count === 7 ? q.count : 5
}

const enT = makeTranslator("en")

/**
 * The selectable options of a question in authored order (before randomisation).
 * Returns [] for types without discrete options.
 */
export function getOptions(q: Question, t: Translator = enT): ChoiceOption[] {
  switch (q.type) {
    case "single":
    case "dropdown":
    case "multiple":
    case "ranking":
      return q.options ?? []
    case "likert":
    case "matrix":
      return q.options && q.options.length > 0 ? q.options : presetOptions(q.preset ?? (q.type === "matrix" ? "frequency4" : "agree5"), t)
    case "boolean":
      return [
        { value: "Yes", label: q.yesLabel ?? t("yes"), score: 1 },
        { value: "No", label: q.noLabel ?? t("no"), score: 0 },
      ]
    case "faces": {
      const n = faceCount(q)
      return FACE_KEYS[n].map((key, i) => ({ value: i + 1, label: q.labels?.[i] ?? t(key) }))
    }
    case "rating": {
      const out: ChoiceOption[] = []
      const lo = Math.min(q.min, q.max)
      const hi = Math.max(q.min, q.max)
      for (let v = lo; v <= hi && out.length < 101; v++) out.push({ value: v })
      return out
    }
    default:
      return []
  }
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  return String(a) === String(b)
}

export function findOption(q: Question, value: unknown, t?: Translator): ChoiceOption | undefined {
  return getOptions(q, t).find((o) => sameValue(o.value, value))
}

export function hasOther(q: Question): boolean {
  return (q.type === "single" || q.type === "dropdown" || q.type === "multiple") && q.allowOther === true
}

export function isOtherValue(v: unknown): boolean {
  return v === OTHER_VALUE
}

export function optionValues(q: Question): OptionValue[] {
  return getOptions(q).map((o) => o.value)
}
