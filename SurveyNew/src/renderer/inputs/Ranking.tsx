import * as React from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowDownIcon, ArrowUpIcon, GripVerticalIcon } from "lucide-react"
import type { ChoiceOption, OptionValue, RankingQuestion } from "@/survey/schema"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { Markdown } from "../Markdown"
import { useRunner } from "../context"
import { optionKey } from "./ChoiceCards"
import type { InputProps } from "./types"
import { useOrderedOptions } from "./useOrderedOptions"

function Row({
  option,
  index,
  count,
  onMove,
  ranked,
}: {
  option: ChoiceOption
  index: number
  count: number
  onMove: (from: number, to: number) => void
  ranked: boolean
}) {
  const { text, t } = useRunner()
  const id = optionKey(option.value)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const label = text(option.label) || String(option.value)
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex min-h-12 items-center gap-2 rounded-lg border bg-card py-1.5 pr-1.5 pl-1 shadow-xs",
        isDragging && "z-10 shadow-lg ring-2 ring-primary/40",
      )}
    >
      <button
        type="button"
        className="flex h-10 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground active:cursor-grabbing"
        aria-label={`${label}: ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
          ranked ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {index + 1}
      </span>
      <Markdown inline className="min-w-0 flex-1 text-[0.95rem]">
        {label}
      </Markdown>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9"
        disabled={index === 0}
        aria-label={`${t("moveUp")}: ${label}`}
        onClick={() => onMove(index, index - 1)}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-9"
        disabled={index === count - 1}
        aria-label={`${t("moveDown")}: ${label}`}
        onClick={() => onMove(index, index + 1)}
      >
        <ArrowDownIcon />
      </Button>
    </li>
  )
}

/** Drag (or arrow buttons) to rank options. Answered once the participant reorders or confirms. */
export function RankingInput({ q, value, onChange, labelledBy, describedBy }: InputProps<RankingQuestion>) {
  const { t } = useRunner()
  const options = useOrderedOptions(q)
  const byKey = React.useMemo(() => new Map(options.map((o) => [optionKey(o.value), o])), [options])
  const order: OptionValue[] = Array.isArray(value) && value.length === options.length ? value : options.map((o) => o.value)
  const items = order.map((v) => byKey.get(optionKey(v))).filter((o): o is ChoiceOption => !!o)
  const ranked = Array.isArray(value)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return
    onChange(arrayMove(items, from, to).map((o) => o.value))
  }
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = items.findIndex((o) => optionKey(o.value) === e.active.id)
    const to = items.findIndex((o) => optionKey(o.value) === e.over!.id)
    move(from, to)
  }

  return (
    <div className="grid gap-2" role="group" aria-labelledby={labelledBy} aria-describedby={describedBy}>
      <p className="text-sm text-muted-foreground">{t("rankingHint")}</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((o) => optionKey(o.value))} strategy={verticalListSortingStrategy}>
          <ol className="grid gap-2">
            {items.map((o, i) => (
              <Row key={optionKey(o.value)} option={o} index={i} count={items.length} onMove={move} ranked={ranked} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {!ranked ? (
        <Button type="button" variant="outline" className="h-11" onClick={() => onChange(items.map((o) => o.value))}>
          {t("rankingConfirm")}
        </Button>
      ) : null}
    </div>
  )
}
