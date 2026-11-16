import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"
import type { MatrixQuestion } from "@/survey/schema"
import { getOptions } from "@/survey/options"
import { applyOrder } from "@/survey/randomize"
import { isAnswered, rowKey } from "@/survey/values"
import { cn } from "@/lib/utils"
import { Markdown } from "../Markdown"
import { useRunner } from "../context"
import { optionKey } from "./ChoiceCards"
import type { InputProps } from "./types"
import { useElementWidth } from "./useElementWidth"

/**
 * Grid of rows sharing one answer scale.
 * Phones: one card per row with wrapping option pills. Wide screens (>= 640px): a table.
 */
export function MatrixInput({ q, invalid, labelledBy, describedBy }: InputProps<MatrixQuestion>) {
  const { text, t, answers, setAnswer, optionOrder } = useRunner()
  const columns = getOptions(q, t)
  const rows = applyOrder(q.rows, optionOrder[q.id], (r) => r.id)
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const wide = width >= 640 && columns.length <= 7
  const byKey = React.useMemo(() => new Map(columns.map((c) => [optionKey(c.value), c.value])), [columns])
  const colLabel = (c: (typeof columns)[number]) => text(c.label) || String(c.value)

  return (
    <div ref={ref} role="group" aria-labelledby={labelledBy} aria-describedby={describedBy} className="grid gap-3">
      {wide ? (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left font-medium">
                  <span className="sr-only">{text(q.text)}</span>
                </th>
                {columns.map((c) => (
                  <th key={optionKey(c.value)} scope="col" className="p-2 text-center align-bottom text-xs font-medium text-muted-foreground">
                    {colLabel(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = rowKey(q.id, r.id)
                const v = answers[key]
                const rowId = `${q.id}-${r.id}-label`
                const missing = invalid && !isAnswered(v)
                return (
                  <RadioGroupPrimitive.Root
                    key={r.id}
                    asChild
                    value={v == null ? "" : optionKey(v)}
                    onValueChange={(k) => setAnswer(key, byKey.get(k))}
                    aria-labelledby={rowId}
                    orientation="horizontal"
                  >
                    <tr className={cn("border-b last:border-0", missing && "bg-destructive/5")}>
                      <th id={rowId} scope="row" className="p-3 text-left font-normal">
                        <Markdown inline>{text(r.text)}</Markdown>
                      </th>
                      {columns.map((c) => (
                        <td key={optionKey(c.value)} className="p-1 text-center">
                          <RadioGroupPrimitive.Item
                            value={optionKey(c.value)}
                            aria-label={colLabel(c)}
                            className="group/m inline-flex size-11 items-center justify-center rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          >
                            <span className="flex size-5 items-center justify-center rounded-full border border-input bg-background group-data-[state=checked]/m:border-primary">
                              <span className="size-2.5 scale-0 rounded-full bg-primary transition-transform group-data-[state=checked]/m:scale-100" />
                            </span>
                          </RadioGroupPrimitive.Item>
                        </td>
                      ))}
                    </tr>
                  </RadioGroupPrimitive.Root>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        rows.map((r) => {
          const key = rowKey(q.id, r.id)
          const v = answers[key]
          const rowId = `${q.id}-${r.id}-label`
          const missing = invalid && !isAnswered(v)
          return (
            <div key={r.id} className={cn("grid gap-2 rounded-lg border bg-card p-3", missing && "border-destructive/60")}>
              <div id={rowId} className="text-[0.95rem] font-medium">
                <Markdown inline>{text(r.text)}</Markdown>
              </div>
              <RadioGroupPrimitive.Root
                value={v == null ? "" : optionKey(v)}
                onValueChange={(k) => setAnswer(key, byKey.get(k))}
                aria-labelledby={rowId}
                className="flex flex-wrap gap-1.5"
              >
                {columns.map((c) => (
                  <RadioGroupPrimitive.Item
                    key={optionKey(c.value)}
                    value={optionKey(c.value)}
                    className="min-h-10 rounded-full border bg-background px-3 py-1.5 text-sm transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                  >
                    {colLabel(c)}
                  </RadioGroupPrimitive.Item>
                ))}
              </RadioGroupPrimitive.Root>
            </div>
          )
        })
      )}
    </div>
  )
}
