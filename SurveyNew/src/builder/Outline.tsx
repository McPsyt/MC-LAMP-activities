import * as React from "react"
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AlertCircleIcon, GitBranchIcon, GripVerticalIcon, OctagonXIcon, PlusIcon } from "lucide-react"
import type { Question, QuestionType } from "@/survey/schema"
import { isDisplayItem } from "@/survey/schema"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useBuilder } from "./store"
import { TYPE_INFO, typeInfo } from "./questionTypes"
import { getDefaultL, getL } from "./lstring"
import type { Issue } from "./validate"

const GROUPS = ["Choice", "Scale", "Entry", "Date & time", "Layout"] as const

export function AddQuestionMenu({ afterId, children }: { afterId?: string | null; children: React.ReactNode }) {
  const add = useBuilder((s) => s.addQuestion)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-[70vh] w-64 overflow-y-auto" align="start">
        {GROUPS.map((g, i) => (
          <DropdownMenuGroup key={g}>
            {i > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel className="text-xs text-muted-foreground">{g}</DropdownMenuLabel>
            {TYPE_INFO.filter((t) => t.group === g).map((t) => (
              <DropdownMenuItem key={t.type} onSelect={() => add(t.type as QuestionType, afterId)}>
                <t.icon />
                <div className="grid">
                  <span>{t.label}</span>
                  <span className="text-xs text-muted-foreground">{t.hint}</span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function Row({ q, index, number, selected, issues }: { q: Question; index: number; number?: number; selected: boolean; issues: Issue[] }) {
  const select = useBuilder((s) => s.select)
  const editLang = useBuilder((s) => s.editLang)
  const defaultLang = useBuilder((s) => s.survey.defaultLanguage ?? "en")
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id })
  const info = typeInfo(q.type)
  const text = getL(q.text, editLang, defaultLang) || getDefaultL(q.text, defaultLang)
  const errors = issues.filter((i) => i.level === "error").length
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-1 rounded-md border border-transparent pr-2 text-sm",
        selected ? "border-primary/40 bg-primary/[0.07]" : "hover:bg-accent",
        q.type === "section" && "mt-2 font-semibold",
        isDragging && "z-10 bg-background shadow-md",
      )}
    >
      <button type="button" className="flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground opacity-40 group-hover:opacity-100" aria-label={`Reorder ${q.id}`} {...attributes} {...listeners}>
        <GripVerticalIcon className="size-3.5" />
      </button>
      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left" onClick={() => select(q.id)} aria-current={selected || undefined} data-testid={`outline-${q.id}`}>
        <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{number ?? ""}</span>
        <info.icon className="size-4 shrink-0 text-muted-foreground" />
        <span className={cn("truncate", !text && "text-muted-foreground italic")}>{text || `Untitled ${info.label.toLowerCase()}`}</span>
      </button>
      {q.showIf ? <GitBranchIcon className="size-3.5 shrink-0 text-primary" aria-label="Has show-if logic" /> : null}
      {q.endSurveyIf ? <OctagonXIcon className="size-3.5 shrink-0 text-primary" aria-label="Can end the survey" /> : null}
      {errors ? <AlertCircleIcon className="size-3.5 shrink-0 text-destructive" aria-label={`${errors} error(s)`} /> : null}
      <span className="sr-only">position {index + 1}</span>
    </li>
  )
}

export function Outline({ issues }: { issues: Issue[] }) {
  const questions = useBuilder((s) => s.survey.questions)
  const selectedId = useBuilder((s) => s.selectedId)
  const move = useBuilder((s) => s.moveQuestion)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const numbers = React.useMemo(() => {
    let n = 0
    return new Map(questions.map((q) => [q.id, isDisplayItem(q) ? undefined : ++n]))
  }, [questions])
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    move(
      questions.findIndex((q) => q.id === e.active.id),
      questions.findIndex((q) => q.id === e.over!.id),
    )
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold">Questions</h2>
        <AddQuestionMenu afterId={selectedId}>
          <Button size="sm" variant="outline" className="h-8">
            <PlusIcon /> Add
          </Button>
        </AddQuestionMenu>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {questions.length === 0 ? (
          <div className="grid gap-3 p-4 text-center text-sm text-muted-foreground">
            <p>No questions yet.</p>
            <AddQuestionMenu>
              <Button size="sm">
                <PlusIcon /> Add your first question
              </Button>
            </AddQuestionMenu>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
              <ol className="grid gap-0.5" aria-label="Questions">
                {questions.map((q, i) => (
                  <Row key={q.id} q={q} index={i} number={numbers.get(q.id)} selected={q.id === selectedId} issues={issues.filter((x) => x.questionId === q.id)} />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  )
}
