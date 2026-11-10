import { APP_NAME } from "@/lib/site"

import { GLYPH_CAP_HEIGHT, GLYPHS } from "./icon-glyphs"

/*
 * The app's mark: the first letter of APP_NAME (never spelled here: it follows the name) in the
 * serif's semibold, rubric on paper, framed by a hairline of ink. The dark scheme swaps paper and
 * ink inside the SVG (`prefers-color-scheme`), so one file serves both.
 */

/** The colours of the tokens (globals.css), as sRGB for image formats. */
export const ICON_COLORS = {
  light: { paper: "#f9f5ed", ink: "#1f1915", rubric: "#b43722" },
  dark: { paper: "#1a1713", ink: "#e2ddd4", rubric: "#e98667" },
} as const

/** The letter the mark shows: APP_NAME's first, as a capital. */
export function iconLetter(name: string = APP_NAME): string {
  return (name.trim()[0] ?? "?").toLocaleUpperCase("en")
}

/**
 * The mark as SVG markup, `size` pixels square. `frame`: the 1 px ink border (the favicon); the
 * home-screen icon goes without (the system rounds and frames it). `scheme`: "auto" follows the
 * reader's colour scheme, else fixed.
 */
export function iconSvg({
  size = 32,
  frame = true,
  scheme = "auto",
}: { size?: number; frame?: boolean; scheme?: "auto" | "light" | "dark" } = {}): string {
  const colors = ICON_COLORS[scheme === "dark" ? "dark" : "light"]
  const letter = iconLetter()
  const glyph = GLYPHS[letter]
  // The cap height takes ~62 % of the square; the letter sits on the optical centre.
  const cap = size * 0.62
  const scale = cap / GLYPH_CAP_HEIGHT
  const baseline = (size + cap) / 2
  const shape = glyph
    ? `<path class="l" fill="${colors.rubric}" transform="translate(${fmt((size - glyph.width * scale) / 2)} ${fmt(baseline)}) scale(${fmt(scale, 5)})" d="${glyph.d}"/>`
    : `<text class="l" x="50%" y="${fmt(baseline)}" text-anchor="middle" font-family="Georgia, serif" font-weight="600" font-size="${fmt(cap / 0.7)}" fill="${colors.rubric}">${escapeXml(letter)}</text>`
  const border = frame
    ? `<rect class="f" x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="${fmt(size / 16)}" fill="none" stroke="${colors.ink}" stroke-width="1"/>`
    : ""
  const dark =
    scheme === "auto"
      ? `<style>@media (prefers-color-scheme: dark){.p{fill:${ICON_COLORS.dark.paper}}.f{stroke:${ICON_COLORS.dark.ink}}.l{fill:${ICON_COLORS.dark.rubric}}}</style>`
      : ""
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    dark +
    `<rect class="p" width="${size}" height="${size}" rx="${frame ? fmt(size / 16) : 0}" fill="${colors.paper}"/>` +
    border +
    shape +
    `</svg>`
  )
}

function fmt(n: number, digits = 2): string {
  return String(Number(n.toFixed(digits)))
}

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)
}
