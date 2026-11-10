"use client"

import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { EnterGlyph } from "@/components/ui/kbd"
import { useModKey } from "@/hooks/use-mod-key"
import { isPlainKey, isTypingTarget, overlayOpen } from "@/lib/keyboard"
import { cn } from "@/lib/utils"

/**
 * One shortcut: its ways to press it, each a combination of keys pressed together ("mod" is ⌘ or
 * Ctrl), or with `sequence`, keys pressed one after the other (`g` then `i`).
 */
export interface Shortcut {
  keys: readonly (readonly string[])[]
  label: string
  sequence?: boolean
}

/** A page's own shortcuts, listed in the dialog above the app's; `legend` explains its marks. */
export interface ShortcutSection {
  title: string
  shortcuts: readonly Shortcut[]
  /** What the page's signs mean (the inbox's relevance marks), after its keys. */
  legend?: readonly { sign: ReactNode; meaning: string }[]
}

/** What works on every page. */
export const GLOBAL_SHORTCUTS: ShortcutSection = {
  title: "Everywhere",
  shortcuts: [
    { keys: [["g", "t"]], label: "Go to Today", sequence: true },
    { keys: [["g", "i"]], label: "Go to the inbox", sequence: true },
    { keys: [["g", "s"]], label: "Go to the search page", sequence: true },
    {
      keys: [["g", "1…9"]],
      label: "Go to a bibliography, in the top bar’s order",
      sequence: true,
    },
    { keys: [["/"]], label: "Filter this page, or search the library" },
    { keys: [["mod", "K"]], label: "Search the library" },
    { keys: [["mod", "↵"]], label: "In the search palette: search the papers’ full text" },
    { keys: [["?"]], label: "Show the keyboard shortcuts" },
    { keys: [["Esc"]], label: "Close a dialog or a menu" },
  ],
}

interface ShortcutsControl {
  open: boolean
  setOpen: (open: boolean) => void
  /** Open the dialog (a "Shortcuts" button). */
  show: () => void
  /** A page declares its shortcuts while mounted; returns the unregistration. */
  register: (section: ShortcutSection) => () => void
}

const ShortcutsContext = createContext<ShortcutsControl | null>(null)

/**
 * The one keyboard shortcuts dialog: "?" anywhere (but in a text field or over another dialog), or a
 * page's button, opens it; it lists the current page's shortcuts, then the app's.
 */
export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false)
  const [sections, setSections] = useState<readonly ShortcutSection[]>([])
  // Where the focus goes back on close: the dialog has no trigger (a key or any button opens it).
  const returnFocus = useRef<Element | null>(null)
  const setOpen = useMemo(
    () => (next: boolean) => {
      if (next) returnFocus.current = document.activeElement
      setOpenState(next)
    },
    []
  )

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "?" || !isPlainKey(e) || isTypingTarget(e.target) || overlayOpen()) return
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [setOpen])

  // Stable, so a page's registration does not run again whenever the dialog opens.
  const register = useMemo(
    () => (section: ShortcutSection) => {
      setSections((s) => [...s, section])
      return () => setSections((s) => s.filter((x) => x !== section))
    },
    []
  )
  const value = useMemo<ShortcutsControl>(
    () => ({ open, setOpen, show: () => setOpen(true), register }),
    [open, setOpen, register]
  )

  return (
    <ShortcutsContext value={value}>
      {children}
      <ShortcutsDialog
        open={open}
        onOpenChange={setOpen}
        sections={sections}
        onCloseAutoFocus={(e) => {
          const el = returnFocus.current
          returnFocus.current = null
          if (el instanceof HTMLElement && el.isConnected && el !== document.body) {
            e.preventDefault()
            el.focus({ preventScroll: true })
          }
        }}
      />
    </ShortcutsContext>
  )
}

export function useShortcuts(): ShortcutsControl {
  const ctx = useContext(ShortcutsContext)
  if (!ctx) throw new Error("useShortcuts() needs <ShortcutsProvider> (the app's providers).")
  return ctx
}

/** Lists a page's shortcuts in the dialog while the page is mounted (pass a module constant). */
export function usePageShortcuts(section: ShortcutSection): void {
  const { register } = useShortcuts()
  useEffect(() => register(section), [register, section])
}

/** One key cap: sans 12.5, a hairline, radius 4. */
export function KeyCap({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-[1.375rem] min-w-[1.375rem] items-center justify-center rounded-[4px] border border-border bg-background px-1.5 font-sans text-kbd font-medium text-foreground shadow-[0_1px_0_var(--border)]",
        className
      )}
    >
      {children === "↵" ? <EnterGlyph /> : children}
    </kbd>
  )
}

/**
 * Keys pressed together ("mod" shows as ⌘ on Apple systems, Ctrl elsewhere), or one after the other
 * with `sequence`.
 */
export function Keys({
  keys,
  sequence = false,
  className,
}: {
  keys: readonly string[]
  sequence?: boolean
  className?: string
}) {
  const mod = useModKey()
  return (
    <kbd className={cn("inline-flex items-center gap-1", sequence && "gap-1.5", className)}>
      {keys.map((k, i) => (
        <Fragment key={`${i}-${k}`}>
          {i > 0 && !sequence && mod === "Ctrl" ? (
            <span aria-hidden className="text-kbd text-muted-foreground">
              +
            </span>
          ) : null}
          <KeyCap>{k === "mod" ? mod : k}</KeyCap>
        </Fragment>
      ))}
    </kbd>
  )
}

function ShortcutRows({ section, headingId }: { section: ShortcutSection; headingId: string }) {
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="mb-1 label">
        {section.title}
      </h3>
      <dl className="text-sm">
        {section.shortcuts.map((s) => (
          <div
            key={s.label}
            className="flex items-center justify-between gap-4 border-b border-border py-1.5 last:border-b-0"
          >
            <dt className="min-w-0 text-pretty">{s.label}</dt>
            <dd className="flex shrink-0 items-center gap-1.5">
              {s.keys.map((combo, i) => (
                <Fragment key={combo.join("+")}>
                  {i > 0 ? <span className="text-kbd text-muted-foreground">or</span> : null}
                  <Keys keys={combo} sequence={s.sequence} />
                </Fragment>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      {section.legend?.length ? (
        <dl className="mt-2 text-sm">
          {section.legend.map((item) => (
            <div key={item.meaning} className="flex items-baseline gap-3 py-1">
              <dt className="w-6 shrink-0 text-center">{item.sign}</dt>
              <dd className="min-w-0 text-pretty text-muted-foreground">{item.meaning}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  )
}

function ShortcutsDialog({
  open,
  onOpenChange,
  sections,
  onCloseAutoFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sections: readonly ShortcutSection[]
  onCloseAutoFocus: (e: Event) => void
}) {
  const all = [...sections, GLOBAL_SHORTCUTS]
  const content = useRef<HTMLDivElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // A list to read, no field: the dialog itself takes the focus (its arrows scroll it), not
        // its close button.
        ref={content}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          content.current?.focus({ preventScroll: true })
        }}
        className="max-h-[min(42rem,88dvh)] overflow-y-auto focus-visible:outline-none sm:max-w-lg"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle className="title">Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Keys do nothing while you type in a field. A <KeyCap>g</KeyCap> chord waits a second for
            its second key.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          {all.map((section, i) => (
            <ShortcutRows key={section.title} section={section} headingId={`shortcuts-${i}`} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
