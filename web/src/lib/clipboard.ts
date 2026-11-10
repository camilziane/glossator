/**
 * Text to the clipboard: the async API, or the old way where it is missing (no secure context). The
 * typesetting's word joiners (U+2060, `@/lib/typeset`) stay on the page: LaTeX and plain editors
 * choke on them.
 */
export async function copyText(value: string): Promise<boolean> {
  const text = value.replace(/\u2060/gu, "")
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // refused: try the old way below
  }
  // The old way selects a hidden text area, which takes the focus: give it back whatever happens.
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const area = document.createElement("textarea")
  try {
    area.value = text
    area.setAttribute("readonly", "")
    area.style.position = "fixed"
    area.style.opacity = "0"
    document.body.append(area)
    area.select()
    return document.execCommand("copy")
  } catch {
    return false
  } finally {
    area.remove()
    previous?.focus()
  }
}
