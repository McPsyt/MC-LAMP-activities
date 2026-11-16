import * as React from "react"
import { cn } from "@/lib/utils"
import { parseBlocks, parseInlineText } from "./miniMarkdown"

/**
 * Renders survey text as (a safe subset of) Markdown: bold, italics, links, lists, quotes, images.
 * Raw HTML is shown as text, never rendered. `inline` keeps the output inside a <span>.
 */
export const Markdown = React.memo(function Markdown({
  children,
  inline = false,
  className,
}: {
  children: string
  inline?: boolean
  className?: string
}) {
  if (!children) return null
  if (inline) return <span className={cn("md", className)}>{parseInlineText(children)}</span>
  return <div className={cn("md", className)}>{parseBlocks(children)}</div>
})
