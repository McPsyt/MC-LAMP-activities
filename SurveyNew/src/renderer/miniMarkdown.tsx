/**
 * Tiny, safe Markdown subset -> React elements (no HTML strings, no dangerouslySetInnerHTML).
 *
 * Blocks : paragraphs (single newlines become line breaks), # / ## / ### headings, - * + bullet lists,
 *          1. numbered lists, > quotes.
 * Inline : **bold**, __bold__, *italic*, _italic_, ~~strike~~, `code`, [text](url), ![alt](url),
 *          bare https:// links, backslash escapes.
 * URLs   : http(s), mailto, tel and data:image only; anything else renders as plain text.
 * Raw HTML is shown as text.
 */
import * as React from "react"

type Node = React.ReactNode

const SAFE_URL = /^(https?:|mailto:|tel:|data:image\/(png|jpe?g|gif|webp|svg\+xml);)/i

export function safeUrl(url: string): string | undefined {
  const u = url.trim()
  return SAFE_URL.test(u) ? u : undefined
}

const INLINE = new RegExp(
  [
    String.raw`\\([\\` + "`" + String.raw`*_{}\[\]()#+\-.!|>~<])`, // 1 escape
    "`([^`]+)`", // 2 code
    String.raw`!\[([^\]]*)\]\(([^)\s]+)\)`, // 3,4 image
    String.raw`\[([^\]]+)\]\(([^)\s]+)\)`, // 5,6 link
    String.raw`\*\*([\s\S]+?)\*\*`, // 7 bold
    String.raw`__([\s\S]+?)__`, // 8 bold
    String.raw`~~([\s\S]+?)~~`, // 9 strike
    String.raw`\*([^*\s](?:[\s\S]*?[^*\s])?)\*`, // 10 italic
    String.raw`(?<![A-Za-z0-9])_([^_\s](?:[\s\S]*?[^_\s])?)_(?![A-Za-z0-9])`, // 11 italic
    String.raw`(https?:\/\/[^\s<]*[^\s<.,;:!?)\]'"])`, // 12 autolink
  ].join("|"),
)

export function parseInline(text: string, keyPrefix = "i"): Node[] {
  const out: Node[] = []
  let rest = text
  let k = 0
  while (rest) {
    const m = INLINE.exec(rest)
    if (!m) {
      out.push(rest)
      break
    }
    if (m.index > 0) out.push(rest.slice(0, m.index))
    const key = `${keyPrefix}${k++}`
    if (m[1] !== undefined) out.push(m[1])
    else if (m[2] !== undefined) out.push(<code key={key}>{m[2]}</code>)
    else if (m[3] !== undefined) {
      const src = safeUrl(m[4])
      out.push(src ? <img key={key} src={src} alt={m[3]} loading="lazy" /> : m[0])
    } else if (m[5] !== undefined) {
      const href = safeUrl(m[6])
      const children = parseInline(m[5], `${key}-`)
      out.push(
        href ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ) : (
          <React.Fragment key={key}>{children}</React.Fragment>
        ),
      )
    } else if (m[7] !== undefined || m[8] !== undefined) {
      out.push(<strong key={key}>{parseInline(m[7] ?? m[8], `${key}-`)}</strong>)
    } else if (m[9] !== undefined) out.push(<del key={key}>{parseInline(m[9], `${key}-`)}</del>)
    else if (m[10] !== undefined || m[11] !== undefined) {
      out.push(<em key={key}>{parseInline(m[10] ?? m[11], `${key}-`)}</em>)
    } else if (m[12] !== undefined) {
      out.push(
        <a key={key} href={m[12]} target="_blank" rel="noopener noreferrer">
          {m[12]}
        </a>,
      )
    }
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}

function withBreaks(lines: string[], keyPrefix: string): Node[] {
  const out: Node[] = []
  lines.forEach((l, i) => {
    if (i > 0) out.push(<br key={`${keyPrefix}br${i}`} />)
    out.push(...parseInline(l, `${keyPrefix}l${i}-`))
  })
  return out
}

const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const HEADING = /^(#{1,3})\s+(.*)$/

export function parseBlocks(text: string): Node[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const out: Node[] = []
  let i = 0
  let k = 0
  while (i < lines.length) {
    const line = lines[i]
    const key = `b${k++}`
    if (line.trim() === "") {
      i++
      continue
    }
    const h = HEADING.exec(line)
    if (h) {
      const Tag = h[1].length === 1 ? "h3" : h[1].length === 2 ? "h4" : "h5"
      out.push(
        <Tag key={key} className="font-semibold">
          {parseInline(h[2], `${key}-`)}
        </Tag>,
      )
      i++
      continue
    }
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line)
      const re = ordered ? NUMBERED : BULLET
      const items: string[] = []
      const start = ordered ? Number(NUMBERED.exec(line)![1]) : 1
      while (i < lines.length && re.test(lines[i])) {
        const m = re.exec(lines[i])!
        items.push(ordered ? m[2] : m[1])
        i++
      }
      const lis = items.map((it, j) => <li key={j}>{parseInline(it, `${key}-${j}-`)}</li>)
      out.push(
        ordered ? (
          <ol key={key} start={start !== 1 ? start : undefined}>
            {lis}
          </ol>
        ) : (
          <ul key={key}>{lis}</ul>
        ),
      )
      continue
    }
    if (QUOTE.test(line)) {
      const q: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) q.push(QUOTE.exec(lines[i++])![1])
      out.push(<blockquote key={key}>{withBreaks(q, `${key}-`)}</blockquote>)
      continue
    }
    const para: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !HEADING.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !NUMBERED.test(lines[i]) &&
      !QUOTE.test(lines[i])
    ) {
      para.push(lines[i++])
    }
    out.push(<p key={key}>{withBreaks(para, `${key}-`)}</p>)
  }
  return out
}

/** Inline rendering of possibly multi-line text: lines joined with <br>. */
export function parseInlineText(text: string): Node[] {
  return withBreaks(text.replace(/\r\n?/g, "\n").split("\n"), "n")
}
