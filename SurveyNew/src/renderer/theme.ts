import type { Appearance } from "@/survey/schema"

export function prefersDark(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-color-scheme: dark)").matches
  } catch {
    return false
  }
}

/** Apply a survey's appearance to an element (the <html> element in the activity, the preview root in the builder). */
export function applyAppearance(el: HTMLElement, appearance: Appearance) {
  el.dataset.theme = appearance.theme || "zinc"
  el.dataset.radius = appearance.radius || "md"
  const dark = appearance.mode === "dark" || (appearance.mode === "system" && prefersDark())
  el.classList.toggle("dark", dark)
  el.style.colorScheme = dark ? "dark" : "light"
}
