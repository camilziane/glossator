import { CornerDownLeftIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** The Enter key: no font of the app has ↵, so a drawn arrow (its name for screen readers). */
export function EnterGlyph() {
  return (
    <>
      <CornerDownLeftIcon aria-hidden className="size-3" />
      <span className="sr-only">Enter</span>
    </>
  )
}

/**
 * A key, in the mono (12 px, `text-kbd`) on a hairline; "↵" is drawn (`EnterGlyph`). `hint`: a
 * keyboard hint inside a control, shown only while the control is hovered or has the keyboard's focus,
 * never on touch screens (`data-kbd-hint`, globals.css); keys in the shortcuts dialog, the palette's
 * footer or prose leave it off.
 */
function Kbd({
  className,
  hint,
  children,
  ...props
}: React.ComponentProps<"kbd"> & { hint?: boolean }) {
  return (
    <kbd
      data-slot="kbd"
      data-kbd-hint={hint ? "" : undefined}
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-lg border border-border bg-transparent px-1 font-mono text-kbd font-normal text-muted-foreground select-none in-data-[slot=tooltip-content]:border-background/30 in-data-[slot=tooltip-content]:text-background [&_svg:not([class*='size-'])]:size-3",
        className
      )}
      {...props}
    >
      {children === "↵" ? <EnterGlyph /> : children}
    </kbd>
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
