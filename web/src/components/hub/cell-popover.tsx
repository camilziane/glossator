"use client"

import { type ReactTable, type Row } from "@tanstack/react-table"
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
} from "react"
import { createPortal } from "react-dom"

import { isCut } from "./clamp-measure"
import { RowLinesContext } from "./hub-context"
import { type HubRow } from "./model"
import { type HubFeatures } from "./table-features"

/** How long a pointer or the focus rests on a cut cell before its whole text shows. */
export const POPOVER_DELAY_MS = 400

/** A short grace to move the pointer from the cell onto its popover (WCAG 1.4.13: hoverable). */
const LEAVE_MS = 120

interface Shown {
  rowId: string
  colId: string
  anchor: HTMLElement
}

export interface CellPopoverState {
  shown: Shown | null
  close: () => void
  /** Keep it open while the pointer is over it. */
  hold: () => void
  release: () => void
  /** Listeners for the table's box (one set for every cell). */
  listeners: {
    onPointerOver: (e: PointerEvent<HTMLElement>) => void
    onPointerOut: (e: PointerEvent<HTMLElement>) => void
    onFocus: (e: FocusEvent<HTMLElement>) => void
    onBlur: (e: FocusEvent<HTMLElement>) => void
  }
}

function clampOf(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>("[data-clamp]") : null
}

/**
 * The popover of a cut cell, one per table: after 400 ms of hover or focus on a clamped cell whose
 * text is cut, its whole text shows under it. It stays while the pointer moves onto it, closes on
 * leaving, on Esc, on scrolling or when the focus moves on.
 */
export function useCellPopover(): CellPopoverState {
  const [shown, setShown] = useState<Shown | null>(null)
  const openTimer = useRef(0)
  const closeTimer = useRef(0)
  const armed = useRef<HTMLElement | null>(null)

  const clear = () => {
    window.clearTimeout(openTimer.current)
    window.clearTimeout(closeTimer.current)
  }
  const close = () => {
    clear()
    armed.current = null
    setShown(null)
  }
  const arm = (el: HTMLElement) => {
    window.clearTimeout(closeTimer.current)
    if (armed.current === el) return
    window.clearTimeout(openTimer.current)
    armed.current = el
    openTimer.current = window.setTimeout(() => {
      const td = el.closest<HTMLElement>("td[data-col-id]")
      const tr = el.closest<HTMLElement>("tr[data-row-id]")
      if (!el.isConnected || !td || !tr || !isCut(el)) {
        setShown(null)
        return
      }
      setShown({ rowId: tr.dataset.rowId!, colId: td.dataset.colId!, anchor: el })
    }, POPOVER_DELAY_MS)
  }
  const leave = (delay: number) => {
    window.clearTimeout(openTimer.current)
    window.clearTimeout(closeTimer.current)
    armed.current = null
    closeTimer.current = window.setTimeout(() => setShown(null), delay)
  }

  useEffect(() => {
    if (!shown) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      // Esc puts the text away first; a second one is the page's.
      e.preventDefault()
      e.stopPropagation()
      close()
    }
    const onScroll = () => close()
    window.addEventListener("keydown", onKey, { capture: true })
    window.addEventListener("scroll", onScroll, { capture: true, passive: true })
    shown.anchor.setAttribute("aria-describedby", POPOVER_ID_PREFIX + shown.rowId)
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true })
      window.removeEventListener("scroll", onScroll, { capture: true })
      shown.anchor.removeAttribute("aria-describedby")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `close` only clears state
  }, [shown])

  useEffect(() => clear, [])

  return {
    shown,
    close,
    hold: () => window.clearTimeout(closeTimer.current),
    release: () => leave(LEAVE_MS),
    listeners: {
      onPointerOver: (e) => {
        if (e.pointerType === "touch") return
        const el = clampOf(e.target)
        if (el) arm(el)
      },
      onPointerOut: (e) => {
        const el = clampOf(e.target)
        if (!el || (e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) return
        leave(LEAVE_MS)
      },
      onFocus: (e) => {
        const cell = e.target instanceof Element ? e.target.closest("[data-cell]") : null
        const el = cell === e.target ? cell.querySelector<HTMLElement>("[data-clamp]") : null
        if (el) arm(el)
      },
      onBlur: (e) => {
        if (e.target instanceof Element && e.target.matches("[data-cell]")) leave(0)
      },
    },
  }
}

const POPOVER_ID_PREFIX = "hub-cell-popover-"

/** The popover itself: the cell drawn again with every line, 44 characters wide, under the cell. */
export function CellPopover<R extends HubRow>({
  state,
  table,
  rows,
}: {
  state: CellPopoverState
  table: ReactTable<HubFeatures, R>
  rows: Row<HubFeatures, R>[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)
  const shown = state.shown
  const row = shown ? rows.find((r) => r.id === shown.rowId) : undefined
  const cell = row?.getVisibleCells().find((c) => c.column.id === shown?.colId)

  // Under the cell, its text aligned with the cell's; above it near the window's foot.
  useLayoutEffect(() => {
    const el = ref.current
    if (!shown || !el) {
      setPlace(null)
      return
    }
    const a = shown.anchor.getBoundingClientRect()
    const box = el.getBoundingClientRect()
    const gap = 6
    let top = a.bottom + gap
    if (top + box.height > window.innerHeight - 8) top = Math.max(8, a.top - gap - box.height)
    const left = Math.max(8, Math.min(a.left - 12, window.innerWidth - box.width - 8))
    setPlace({ left, top })
  }, [shown])

  if (!shown || !cell || typeof document === "undefined") return null
  return createPortal(
    <div
      ref={ref}
      id={POPOVER_ID_PREFIX + shown.rowId}
      role="tooltip"
      onPointerEnter={state.hold}
      onPointerLeave={state.release}
      style={place ? { left: place.left, top: place.top } : { left: -9999, top: 0 }}
      className="fixed z-50 w-max max-w-[min(44ch,calc(100vw-1rem))] rounded-lg bg-popover px-3 py-2 font-sans text-table text-popover-foreground [font-stretch:92%] shadow-popover [--pop-y:-4px] motion-safe:animate-pop-in print:hidden"
    >
      <RowLinesContext value="full">
        <table.FlexRender cell={cell} />
      </RowLinesContext>
    </div>,
    document.body
  )
}
