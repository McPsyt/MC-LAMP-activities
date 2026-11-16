import * as React from "react"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import type { SingleQuestion } from "@/survey/schema"
import { OTHER_VALUE } from "@/survey/schema"
import { otherKey } from "@/survey/values"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useRunner } from "../context"
import { optionKey } from "./ChoiceCards"
import type { InputProps } from "./types"
import { useOrderedOptions } from "./useOrderedOptions"

/** Searchable single choice for long option lists. */
export function DropdownInput({ q, value, onChange, invalid, labelledBy, describedBy }: InputProps<SingleQuestion>) {
  const { text, t, answers, setAnswer } = useRunner()
  const [open, setOpen] = React.useState(false)
  const options = useOrderedOptions(q)
  const all = q.allowOther ? [...options, { value: OTHER_VALUE, label: text(q.otherLabel) || t("other") }] : options
  const current = all.find((o) => value != null && optionKey(o.value) === optionKey(value))
  const labelOf = (o: (typeof all)[number]) => text(o.label) || String(o.value)
  const otherText = answers[otherKey(q.id)]
  return (
    <div className="grid gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={`${labelledBy} ${q.id}-dropdown-value`}
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className={cn("h-12 w-full justify-between text-base font-normal", !current && "text-muted-foreground")}
          >
            <span id={`${q.id}-dropdown-value`} className="truncate">{current ? labelOf(current) : text(q.placeholder) || t("choose")}</span>
            <ChevronsUpDownIcon className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder={t("search")} className="h-11" />
            <CommandList>
              <CommandEmpty>{t("noResults")}</CommandEmpty>
              <CommandGroup>
                {all.map((o) => (
                  <CommandItem
                    key={optionKey(o.value)}
                    value={`${labelOf(o)} ${optionKey(o.value)}`}
                    onSelect={() => {
                      onChange(o.value)
                      setOpen(false)
                    }}
                    className="min-h-10"
                  >
                    <CheckIcon className={cn(current && optionKey(current.value) === optionKey(o.value) ? "opacity-100" : "opacity-0")} />
                    {labelOf(o)}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value === OTHER_VALUE ? (
        <Input
          aria-label={t("otherPlaceholder")}
          placeholder={t("otherPlaceholder")}
          value={typeof otherText === "string" ? otherText : ""}
          onChange={(e) => setAnswer(otherKey(q.id), e.target.value)}
          className="h-11"
        />
      ) : null}
    </div>
  )
}
