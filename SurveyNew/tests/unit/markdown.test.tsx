import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import { Markdown } from "@/renderer/Markdown"
import { safeUrl } from "@/renderer/miniMarkdown"

describe("Markdown subset", () => {
  it("renders emphasis, links, lists and line breaks", () => {
    const { container } = render(<Markdown>{"**Bold** and *it* [link](https://x.org)\nline2\n\n- a\n- b\n\n1. one"}</Markdown>)
    expect(container.querySelector("strong")?.textContent).toBe("Bold")
    expect(container.querySelector("em")?.textContent).toBe("it")
    const a = container.querySelector("a")!
    expect(a.getAttribute("href")).toBe("https://x.org")
    expect(a.getAttribute("target")).toBe("_blank")
    expect(container.querySelectorAll("br")).toHaveLength(1)
    expect(container.querySelectorAll("ul li")).toHaveLength(2)
    expect(container.querySelectorAll("ol li")).toHaveLength(1)
  })
  it("never renders raw HTML or unsafe URLs", () => {
    const { container } = render(<Markdown>{'<img src=x onerror=alert(1)> [x](javascript:alert(1)) ![i](javascript:1)'}</Markdown>)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("a")).toBeNull()
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>")
    expect(safeUrl("data:image/png;base64,AAA")).toBeTruthy()
    expect(safeUrl("javascript:alert(1)")).toBeUndefined()
  })
  it("honours backslash escapes (used by answer piping)", () => {
    const { container } = render(<Markdown inline>{"\\*\\*not bold\\*\\*"}</Markdown>)
    expect(container.querySelector("strong")).toBeNull()
    expect(container.textContent).toBe("**not bold**")
  })
  it("keeps snake_case words intact", () => {
    const { container } = render(<Markdown inline>{"see dose_time_value here"}</Markdown>)
    expect(container.querySelector("em")).toBeNull()
  })
})
