import localFont from "next/font/local"

/*
 * The three faces, self-hosted from their official npm packages through next/font/local (offline
 * after `npm ci`; never next/font/google). ARCHITECTURE.md 3.2 says which face does what.
 *
 * - Serif, every word that is read: Source Serif 4 (Adobe, `source-serif`), variable weight and
 *   optical size, true italic, small caps, old-style and tabular figures.
 * - Sans, the interface and data: IBM Plex Sans Variable (`@ibm/plex-sans-variable`), weight and
 *   width axes (tables run at 92 % width), true italic.
 * - Mono, commands, keys, paths: IBM Plex Mono (`@ibm/plex-mono`), Regular and Medium, not preloaded.
 *
 * Each family is one call with its roman and italic files (one family name, so `font-style:
 * italic` finds the italic). The roman and italic of the serif and the sans are preloaded: every page
 * reads in the serif, and its italic (venues, glosses, reasons) shows above the fold on most pages.
 *
 * Their CSS variables are not the theme's: globals.css builds `--font-serif`, `--font-sans` and
 * `--font-mono` (the names to use) from them, with the fallbacks.
 */

export const fontSerif = localFont({
  src: [
    {
      path: "../../node_modules/source-serif/WOFF2/VAR/SourceSerif4Variable-Roman.ttf.woff2",
      style: "normal",
    },
    {
      path: "../../node_modules/source-serif/WOFF2/VAR/SourceSerif4Variable-Italic.ttf.woff2",
      style: "italic",
    },
  ],
  variable: "--font-source-serif",
  weight: "200 900",
  display: "swap",
  adjustFontFallback: "Times New Roman",
  fallback: ["Georgia", "Cambria", "Times New Roman", "serif"],
})

export const fontSans = localFont({
  src: [
    {
      path: "../../node_modules/@ibm/plex-sans-variable/fonts/complete/woff2/IBM Plex Sans Var-Roman.woff2",
      style: "normal",
    },
    {
      path: "../../node_modules/@ibm/plex-sans-variable/fonts/complete/woff2/IBM Plex Sans Var-Italic.woff2",
      style: "italic",
    },
  ],
  variable: "--font-plex-sans",
  weight: "100 700",
  // The width axis: `font-stretch: 92%` (tables) picks an instance between 85 % and 100 %.
  declarations: [{ prop: "font-stretch", value: "85% 100%" }],
  display: "swap",
  adjustFontFallback: "Arial",
  fallback: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
})

export const fontMono = localFont({
  src: [
    {
      path: "../../node_modules/@ibm/plex-mono/fonts/complete/woff2/IBMPlexMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../node_modules/@ibm/plex-mono/fonts/complete/woff2/IBMPlexMono-Medium.woff2",
      weight: "500",
      style: "normal",
    },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  fallback: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
})

/** The class names that put the three faces' variables on `<html>` (the root layout uses it). */
export const fontVariables = [fontSerif.variable, fontSans.variable, fontMono.variable].join(" ")
