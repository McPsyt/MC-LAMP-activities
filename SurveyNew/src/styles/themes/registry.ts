/** Theme presets available to surveys. Tokens live in ../themes.css. */
export interface ThemePreset {
  id: string
  label: string
  /** Colour used for the swatch in the builder's theme picker. */
  swatch: string
}

export const THEMES: ThemePreset[] = [
  { id: "zinc", label: "Zinc", swatch: "oklch(0.21 0.006 285.885)" },
  { id: "slate", label: "Slate", swatch: "oklch(0.208 0.042 265.755)" },
  { id: "stone", label: "Stone", swatch: "oklch(0.216 0.006 56.043)" },
  { id: "neutral", label: "Neutral", swatch: "oklch(0.205 0 0)" },
  { id: "blue", label: "Blue", swatch: "oklch(0.546 0.245 262.881)" },
  { id: "green", label: "Green", swatch: "oklch(0.627 0.194 149.214)" },
  { id: "violet", label: "Violet", swatch: "oklch(0.541 0.281 293.009)" },
  { id: "rose", label: "Rose", swatch: "oklch(0.586 0.253 17.585)" },
  { id: "orange", label: "Orange", swatch: "oklch(0.646 0.222 41.116)" },
]

export const DEFAULT_THEME = "zinc"

export const RADII = ["none", "sm", "md", "lg", "xl"] as const
export type Radius = (typeof RADII)[number]
