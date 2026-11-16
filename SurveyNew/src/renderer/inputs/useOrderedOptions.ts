import * as React from "react"
import type { ChoiceOption, Question } from "@/survey/schema"
import { getOptions } from "@/survey/options"
import { applyOrder } from "@/survey/randomize"
import { useRunner } from "../context"

/** Options for a question in the order shown to this participant (randomised when configured). */
export function useOrderedOptions(q: Question): ChoiceOption[] {
  const { t, optionOrder } = useRunner()
  return React.useMemo(() => applyOrder(getOptions(q, t), optionOrder[q.id], (o) => o.value), [q, t, optionOrder])
}
