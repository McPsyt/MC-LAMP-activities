import type { NormalizedSurvey, Question } from "./schema"

export interface Page {
  /** Id of the first item on the page (stable while items before/after appear or disappear). */
  key: string
  items: Question[]
}

/** Split the currently visible items into screens according to the survey layout. */
export function buildPages(survey: NormalizedSurvey, visible: Set<string>): Page[] {
  const items = survey.questions.filter((q) => visible.has(q.id))
  if (items.length === 0) return []
  switch (survey.options.layout) {
    case "single":
      return [{ key: items[0].id, items }]
    case "section": {
      const pages: Page[] = []
      for (const q of items) {
        if (q.type === "section" || pages.length === 0) pages.push({ key: q.id, items: [q] })
        else pages[pages.length - 1].items.push(q)
      }
      return pages
    }
    default:
      return items.map((q) => ({ key: q.id, items: [q] }))
  }
}

/**
 * Index of the page to show for a remembered page key. If that page vanished (its first item
 * became hidden), fall forward to the first page that starts after it in survey order.
 */
export function locatePage(survey: NormalizedSurvey, pages: Page[], key: string | null): number {
  if (pages.length === 0) return -1
  if (!key) return 0
  const exact = pages.findIndex((p) => p.key === key || p.items.some((q) => q.id === key))
  if (exact >= 0) return exact
  const order = new Map(survey.questions.map((q, i) => [q.id, i]))
  const target = order.get(key) ?? 0
  const next = pages.findIndex((p) => (order.get(p.key) ?? 0) >= target)
  return next >= 0 ? next : pages.length - 1
}
