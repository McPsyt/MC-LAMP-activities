import type { SurveyDefinition } from "../survey/schema"
import medication from "./medication-ema.json" with { type: "json" }
import phq9 from "./phq9.json" with { type: "json" }
import gad7 from "./gad7.json" with { type: "json" }
import daily from "./daily-checkin.json" with { type: "json" }
import allTypes from "./all-types.json" with { type: "json" }

export interface Template {
  id: string
  name: string
  description: string
  survey: SurveyDefinition
}

export const TEMPLATES: Template[] = [
  {
    id: "medication",
    name: "Medication check-in (EMA)",
    description: "Branching example: asks for the time only if the dose was taken. English + French.",
    survey: medication as unknown as SurveyDefinition,
  },
  {
    id: "phq9",
    name: "PHQ-9",
    description: "Depression screener with total score and a safety alert on item 9.",
    survey: phq9 as unknown as SurveyDefinition,
  },
  {
    id: "gad7",
    name: "GAD-7",
    description: "Anxiety screener as a single grid (matrix) with total score.",
    survey: gad7 as unknown as SurveyDefinition,
  },
  {
    id: "daily",
    name: "Daily mood & sleep (EMA)",
    description: "Faces, visual analogue scale, sleep duration and rating. Auto-advances.",
    survey: daily as unknown as SurveyDefinition,
  },
  {
    id: "all",
    name: "All question types",
    description: "A tour of every question type, grouped into sections.",
    survey: allTypes as unknown as SurveyDefinition,
  },
]
