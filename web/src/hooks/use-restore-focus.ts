import { useRef } from "react"

/**
 * For a dialog or sheet opened without a Radix trigger (a shortcut, a URL param, a custom button):
 * Radix gives the focus back to its trigger, so with none it would fall to <body>. Pass these to
 * the content's onOpenAutoFocus / onCloseAutoFocus: the focus goes back where it was.
 */
export function useRestoreFocus(): {
  onOpenAutoFocus: () => void
  onCloseAutoFocus: (e: Event) => void
} {
  const previous = useRef<HTMLElement | null>(null)
  return {
    // Called before the dialog takes the focus: what holds it now is where it goes back.
    onOpenAutoFocus: () => {
      const el = document.activeElement
      previous.current = el instanceof HTMLElement && el !== document.body ? el : null
    },
    onCloseAutoFocus: (e: Event) => {
      const el = previous.current
      previous.current = null
      if (el?.isConnected) {
        e.preventDefault()
        el.focus()
      }
    },
  }
}
