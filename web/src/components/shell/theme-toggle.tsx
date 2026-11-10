"use client"

import { MoonIcon, SunIcon } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

import { useIsClient } from "./client-only"

export const THEMES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const

/** The top bar's quiet icon buttons (the theme, `?`). */
export const barIconButton =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-[4px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground active:translate-y-px aria-expanded:bg-muted aria-expanded:text-foreground [&_svg]:size-4"

/** System, Light or Dark; the icon follows the applied theme through CSS (no flash). */
export function ThemeMenu({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn(barIconButton, className)} aria-label="Theme">
        <SunIcon aria-hidden className="dark:hidden" />
        <MoonIcon aria-hidden className="hidden dark:block" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
          {THEMES.map(({ value, label }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The theme as three words in a row (the phone's Library sheet). */
export function ThemeChoice({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const isClient = useIsClient()
  const chosen = isClient ? (theme ?? "system") : null
  return (
    <div role="radiogroup" aria-label="Theme" className={cn("flex gap-1", className)}>
      {THEMES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={chosen === value}
          onClick={() => setTheme(value)}
          className="h-11 flex-1 rounded-[4px] text-sm text-muted-foreground transition-colors aria-checked:bg-muted aria-checked:font-medium aria-checked:text-foreground"
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/** A CSS colour as #rrggbb (theme-color is read by browsers that know no oklch). */
function toHex(color: string): string | null {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.fillStyle = "#000"
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return `#${[r, g, b].map((n) => (n ?? 0).toString(16).padStart(2, "0")).join("")}`
}

/**
 * The browser's chrome takes the page's paper in the theme chosen here, not only the system's: the
 * theme-color metas (one per scheme, from the layout) all say the applied theme's colour.
 */
export function ThemeColor() {
  const { resolvedTheme } = useTheme()
  useEffect(() => {
    if (!resolvedTheme) return
    // next-themes applies the class in its own effect, after this one: read the paper a frame later.
    const frame = requestAnimationFrame(() => {
      const paper = getComputedStyle(document.body).backgroundColor
      const hex = paper ? toHex(paper) : null
      if (!hex) return
      for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
        meta.content = hex
    })
    return () => cancelAnimationFrame(frame)
  }, [resolvedTheme])
  return null
}
