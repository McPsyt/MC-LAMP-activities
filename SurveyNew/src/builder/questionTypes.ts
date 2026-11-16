import {
  AlignLeftIcon,
  ArrowDownUpIcon,
  CalendarClockIcon,
  CalendarIcon,
  CheckSquareIcon,
  CircleDotIcon,
  ClockIcon,
  GaugeIcon,
  Grid3x3Icon,
  HashIcon,
  HeadingIcon,
  InfoIcon,
  ListIcon,
  MinusIcon,
  SlidersHorizontalIcon,
  SmileIcon,
  TextCursorInputIcon,
  TimerIcon,
  ToggleLeftIcon,
  type LucideIcon,
} from "lucide-react"
import type { Question, QuestionType } from "@/survey/schema"

export interface TypeInfo {
  type: QuestionType
  label: string
  hint: string
  icon: LucideIcon
  group: "Choice" | "Scale" | "Entry" | "Date & time" | "Layout"
}

export const TYPE_INFO: TypeInfo[] = [
  { type: "single", label: "Single choice", hint: "Pick one option", icon: CircleDotIcon, group: "Choice" },
  { type: "multiple", label: "Multiple choice", hint: "Pick several options", icon: CheckSquareIcon, group: "Choice" },
  { type: "dropdown", label: "Dropdown", hint: "Searchable list for many options", icon: ListIcon, group: "Choice" },
  { type: "boolean", label: "Yes / No", hint: "Two buttons", icon: ToggleLeftIcon, group: "Choice" },
  { type: "ranking", label: "Ranking", hint: "Put options in order", icon: ArrowDownUpIcon, group: "Choice" },
  { type: "likert", label: "Likert scale", hint: "Agree/frequency scales", icon: MinusIcon, group: "Scale" },
  { type: "matrix", label: "Grid (matrix)", hint: "Several items, same scale", icon: Grid3x3Icon, group: "Scale" },
  { type: "rating", label: "Numeric rating", hint: "e.g. 0-10 pain scale", icon: GaugeIcon, group: "Scale" },
  { type: "slider", label: "Slider", hint: "Drag to pick a number", icon: SlidersHorizontalIcon, group: "Scale" },
  { type: "vas", label: "Visual analogue scale", hint: "Mark a line, 0-100", icon: MinusIcon, group: "Scale" },
  { type: "faces", label: "Faces", hint: "Mood faces", icon: SmileIcon, group: "Scale" },
  { type: "short", label: "Short text", hint: "One line", icon: TextCursorInputIcon, group: "Entry" },
  { type: "text", label: "Long text", hint: "Paragraph", icon: AlignLeftIcon, group: "Entry" },
  { type: "number", label: "Number", hint: "Whole or decimal", icon: HashIcon, group: "Entry" },
  { type: "date", label: "Date", hint: "Calendar", icon: CalendarIcon, group: "Date & time" },
  { type: "time", label: "Time of day", hint: "Hours and minutes", icon: ClockIcon, group: "Date & time" },
  { type: "datetime", label: "Date and time", hint: "Both", icon: CalendarClockIcon, group: "Date & time" },
  { type: "duration", label: "Duration", hint: "e.g. hours slept", icon: TimerIcon, group: "Date & time" },
  { type: "section", label: "Section header", hint: "Starts a new screen in section layout", icon: HeadingIcon, group: "Layout" },
  { type: "info", label: "Information", hint: "Text only, no answer", icon: InfoIcon, group: "Layout" },
]

export const typeInfo = (t: QuestionType) => TYPE_INFO.find((x) => x.type === t) ?? TYPE_INFO[0]

/** A new question of a type with sensible starting content. */
export function newQuestion(type: QuestionType, id: string): Question {
  const base = { id, text: "" }
  switch (type) {
    case "single":
    case "dropdown":
    case "multiple":
    case "ranking":
      return {
        ...base,
        type,
        options: [
          { value: "option_1", label: "Option 1" },
          { value: "option_2", label: "Option 2" },
        ],
      } as Question
    case "likert":
      return { ...base, type, preset: "agree5" }
    case "matrix":
      return {
        ...base,
        type,
        preset: "frequency4",
        rows: [
          { id: "r1", text: "Item 1" },
          { id: "r2", text: "Item 2" },
        ],
      }
    case "slider":
      return { ...base, type, min: 0, max: 10, step: 1 }
    case "rating":
      return { ...base, type, min: 0, max: 10 }
    case "vas":
      return { ...base, type, minLabel: "Not at all", maxLabel: "Extremely" }
    case "faces":
      return { ...base, type, count: 5 }
    case "time":
    case "datetime":
      return { ...base, type, format: "12h", minuteStep: 5 } as Question
    case "duration":
      return { ...base, type, maxHours: 24, minuteStep: 5 }
    default:
      return { ...base, type } as Question
  }
}

/** Change a question's type, keeping text, logic and any compatible settings. */
export function convertType(q: Question, type: QuestionType): Question {
  if (q.type === type) return q
  const fresh = newQuestion(type, q.id)
  const keep = {
    id: q.id,
    text: q.text,
    description: q.description,
    required: q.required,
    showIf: q.showIf,
    endSurveyIf: q.endSurveyIf,
  }
  const hasOptions = "options" in q && Array.isArray(q.options) && q.options.length > 0
  const takesOptions = ["single", "dropdown", "multiple", "ranking", "likert", "matrix"].includes(type)
  const out = { ...fresh, ...keep } as Question & { options?: unknown }
  if (hasOptions && takesOptions) out.options = (q as { options: unknown }).options
  return JSON.parse(JSON.stringify(out)) as Question
}
