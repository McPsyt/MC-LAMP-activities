/**
 * SurveyNew definition schema (stored as `activity.settings` for spec `lamp.survey_new`).
 *
 * This file is framework-free and shared by the activity runtime and the builder.
 * Bump SCHEMA_VERSION only for breaking structural changes (and add a migration in normalize.ts).
 */

export const SCHEMA_VERSION = 1 as const
export const SPEC_ID = "lamp.survey_new"

/** Text that can be translated: a plain string (default language) or a map of language -> text. */
export type LString = string | Record<string, string>

export type OptionValue = string | number

export interface ChoiceOption {
  /** Value written to the results. Shown as the label when no label is given. */
  value: OptionValue
  label?: LString
  description?: LString
  /** Score used by score definitions; defaults to the value when it is numeric. */
  score?: number
  /** `multiple` only: selecting this option clears all others (e.g. "None of the above"). */
  exclusive?: boolean
}

// ---------------------------------------------------------------------------
// Conditions (branching, termination, alerts)
// ---------------------------------------------------------------------------

export type Operator =
  | "eq"
  | "neq"
  | "in"
  | "notIn"
  | "contains"
  | "notContains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "answered"
  | "unanswered"

export interface QuestionRule {
  /** Question id, or `matrixId.rowId` for a matrix row, or `questionId.other` for "Other" text. */
  question: string
  op: Operator
  value?: unknown
}

export interface ScoreRule {
  score: string
  op: Operator
  value?: number
}

export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | QuestionRule
  | ScoreRule

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export const QUESTION_TYPES = [
  "single",
  "multiple",
  "dropdown",
  "boolean",
  "likert",
  "matrix",
  "ranking",
  "slider",
  "vas",
  "rating",
  "faces",
  "number",
  "short",
  "text",
  "date",
  "time",
  "datetime",
  "duration",
  "info",
  "section",
] as const

export type QuestionType = (typeof QUESTION_TYPES)[number]

/** Types that show content only and never produce an answer. */
export const DISPLAY_TYPES: ReadonlySet<QuestionType> = new Set(["info", "section"])

export const LIKERT_PRESETS = ["agree5", "agree7", "frequency4", "frequency5", "satisfaction5"] as const
export type LikertPreset = (typeof LIKERT_PRESETS)[number]

interface QuestionBase {
  /** Stable identifier (letters, digits, underscore). Used by logic, scores and results. */
  id: string
  type: QuestionType
  /** Question text (Markdown). For `section` this is the section title; for `info` the body. */
  text: LString
  description?: LString
  /** Defaults to true for answerable questions. */
  required?: boolean
  /** Show this question only when the condition is true. */
  showIf?: Condition
  /** After this question, end the survey when the condition is true. */
  endSurveyIf?: Condition
}

export interface SingleQuestion extends QuestionBase {
  type: "single" | "dropdown"
  options: ChoiceOption[]
  randomizeOptions?: boolean
  allowOther?: boolean
  otherLabel?: LString
  placeholder?: LString
}

export interface MultipleQuestion extends QuestionBase {
  type: "multiple"
  options: ChoiceOption[]
  minSelected?: number
  maxSelected?: number
  randomizeOptions?: boolean
  allowOther?: boolean
  otherLabel?: LString
}

export interface BooleanQuestion extends QuestionBase {
  type: "boolean"
  yesLabel?: LString
  noLabel?: LString
}

export interface LikertQuestion extends QuestionBase {
  type: "likert"
  /** Ignored when `options` is given. Defaults to agree5. */
  preset?: LikertPreset
  options?: ChoiceOption[]
}

export interface MatrixRow {
  id: string
  text: LString
}

export interface MatrixQuestion extends QuestionBase {
  type: "matrix"
  rows: MatrixRow[]
  /** Column scale: a preset or custom options (custom wins). */
  preset?: LikertPreset
  options?: ChoiceOption[]
  randomizeRows?: boolean
}

export interface RankingQuestion extends QuestionBase {
  type: "ranking"
  options: ChoiceOption[]
  randomizeOptions?: boolean
}

export interface SliderQuestion extends QuestionBase {
  type: "slider"
  min: number
  max: number
  step?: number
  minLabel?: LString
  midLabel?: LString
  maxLabel?: LString
  unit?: LString
  /** Show the selected number to the participant (default true). */
  showValue?: boolean
  showTicks?: boolean
}

export interface VasQuestion extends QuestionBase {
  type: "vas"
  minLabel?: LString
  maxLabel?: LString
  /** Visual analogue scales normally hide the number (default false). */
  showValue?: boolean
}

export interface RatingQuestion extends QuestionBase {
  type: "rating"
  min: number
  max: number
  minLabel?: LString
  maxLabel?: LString
}

export interface FacesQuestion extends QuestionBase {
  type: "faces"
  /** 3, 5 (default) or 7 faces. Values run 1 (worst) .. count (best). */
  count?: 3 | 5 | 7
  labels?: LString[]
  showLabels?: boolean
}

export interface NumberQuestion extends QuestionBase {
  type: "number"
  min?: number
  max?: number
  /** Allowed decimal places (default 0 = whole numbers). */
  decimals?: number
  unit?: LString
  placeholder?: LString
}

export interface ShortTextQuestion extends QuestionBase {
  type: "short"
  placeholder?: LString
  maxLength?: number
  inputMode?: "text" | "email" | "tel" | "numeric" | "url"
}

export interface LongTextQuestion extends QuestionBase {
  type: "text"
  placeholder?: LString
  maxLength?: number
  rows?: number
}

/** "today", "YYYY-MM-DD", or a relative offset from today like "-30d" / "+7d". */
export type DateBound = string

export interface DateQuestion extends QuestionBase {
  type: "date"
  minDate?: DateBound
  maxDate?: DateBound
}

export interface TimeQuestion extends QuestionBase {
  type: "time"
  format?: "12h" | "24h"
  minuteStep?: number
}

export interface DateTimeQuestion extends QuestionBase {
  type: "datetime"
  format?: "12h" | "24h"
  minuteStep?: number
  minDate?: DateBound
  maxDate?: DateBound
}

export interface DurationQuestion extends QuestionBase {
  type: "duration"
  maxHours?: number
  minuteStep?: number
}

export interface InfoItem extends QuestionBase {
  type: "info"
}

export interface SectionItem extends QuestionBase {
  type: "section"
}

export type Question =
  | SingleQuestion
  | MultipleQuestion
  | BooleanQuestion
  | LikertQuestion
  | MatrixQuestion
  | RankingQuestion
  | SliderQuestion
  | VasQuestion
  | RatingQuestion
  | FacesQuestion
  | NumberQuestion
  | ShortTextQuestion
  | LongTextQuestion
  | DateQuestion
  | TimeQuestion
  | DateTimeQuestion
  | DurationQuestion
  | InfoItem
  | SectionItem

export type QuestionOfType<T extends QuestionType> = Extract<Question, { type: T }>

// ---------------------------------------------------------------------------
// Survey
// ---------------------------------------------------------------------------

export type Layout = "question" | "section" | "single"

export interface SurveyOptions {
  /** question = one question per screen; section = one section per screen; single = all on one page. */
  layout: Layout
  showProgress: boolean
  showQuestionNumbers: boolean
  allowBackNavigation: boolean
  /** Move to the next screen automatically after a single-tap answer. */
  autoAdvance: boolean
  /** Ask before leaving a survey that has answers. */
  confirmExit: boolean
  resume: { enabled: boolean; expiresAfterHours: number }
}

export interface Appearance {
  theme: string
  mode: "light" | "dark" | "system"
  radius: "none" | "sm" | "md" | "lg" | "xl"
}

export interface ScoreDefinition {
  id: string
  label?: LString
  method: "sum" | "mean" | "count"
  /** Question ids (a matrix id includes all its rows; `matrixId.rowId` for a single row). */
  questions: string[]
}

export type AlertSeverity = "info" | "warning" | "critical"

export interface AlertDefinition {
  id: string
  when: Condition
  title?: LString
  message: LString
  severity: AlertSeverity
  /** immediate = as soon as the condition becomes true; submit = after Submit, before saving. */
  timing: "immediate" | "submit"
}

export interface ScreenText {
  title?: LString
  body?: LString
  buttonLabel?: LString
}

export interface SurveyDefinition {
  schemaVersion: typeof SCHEMA_VERSION
  /** Optional instrument identifier (e.g. "phq9"). */
  id?: string
  /** Researcher-facing version string; recorded in every result. */
  version?: string
  title?: LString
  defaultLanguage?: string
  languages?: string[]
  intro?: ScreenText
  completion?: ScreenText
  options?: Partial<SurveyOptions>
  appearance?: Partial<Appearance>
  questions: Question[]
  scores?: ScoreDefinition[]
  alerts?: AlertDefinition[]
}

/** Survey with every optional block filled with defaults. */
export interface NormalizedSurvey extends Omit<SurveyDefinition, "options" | "appearance"> {
  defaultLanguage: string
  languages: string[]
  options: SurveyOptions
  appearance: Appearance
  scores: ScoreDefinition[]
  alerts: AlertDefinition[]
}

export const DEFAULT_OPTIONS: SurveyOptions = {
  layout: "question",
  showProgress: true,
  showQuestionNumbers: false,
  allowBackNavigation: true,
  autoAdvance: false,
  confirmExit: true,
  resume: { enabled: true, expiresAfterHours: 12 },
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "zinc",
  mode: "light",
  radius: "md",
}

// ---------------------------------------------------------------------------
// Answers + results
// ---------------------------------------------------------------------------

/**
 * Answer map keyed by question id. Matrix rows use `matrixId.rowId`, "Other" text uses `questionId.other`.
 */
export type AnswerValue = string | number | OptionValue[] | null
export type Answers = Record<string, AnswerValue | undefined>

/** Value written when the participant picks the "Other" option. */
export const OTHER_VALUE = "other"

export interface TemporalSlice {
  item: string
  value: AnswerValue
  type: null
  level: null
  duration: number
}

export interface SurveyStaticData {
  survey: { schema: number; id?: string; version?: string }
  language: string
  answers: Record<string, AnswerValue>
  skipped: string[]
  scores: Record<string, number | null>
  alerts: string[]
  option_order: Record<string, OptionValue[]>
  terminated_at?: string
  resumed: boolean
}

export interface ActivityResult {
  timestamp: number
  duration: number
  static_data: SurveyStaticData
  temporal_slices: TemporalSlice[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function isDisplayItem(q: Question): q is InfoItem | SectionItem {
  return DISPLAY_TYPES.has(q.type)
}

export function isRequired(q: Question): boolean {
  return !isDisplayItem(q) && q.required !== false
}

/** Question types whose options can be shuffled. */
export function canRandomize(q: Question): q is SingleQuestion | MultipleQuestion | RankingQuestion {
  return q.type === "single" || q.type === "dropdown" || q.type === "multiple" || q.type === "ranking"
}

export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/
