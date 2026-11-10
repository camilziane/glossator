"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Toggle as TogglePrimitive } from "radix-ui"

/*
 * A toggle is a word that is on or off: muted ink off, ink with a 2 px underline on. `outline` keeps a
 * quiet button's hairline (a lone toggle in a toolbar), pressed = the wash.
 */
const toggleVariants = cva(
  "group/toggle relative inline-flex items-center justify-center gap-1 rounded-lg font-sans text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 aria-invalid:text-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /** A word: on = ink and a 2 px underline. */
        default:
          "bg-transparent px-1.5 after:absolute after:inset-x-1.5 after:bottom-0.5 after:h-0.5 after:bg-foreground after:opacity-0 after:transition-opacity after:duration-150 aria-pressed:text-foreground aria-pressed:after:opacity-100 data-[state=on]:text-foreground data-[state=on]:after:opacity-100",
        /** A quiet button that stays pressed: the hairline, the wash when on. */
        outline:
          "border border-rule-strong bg-transparent px-2.5 text-foreground hover:border-input aria-pressed:bg-muted data-[state=on]:border-input data-[state=on]:bg-muted",
      },
      size: {
        default: "h-8 min-w-8",
        sm: "h-7 min-w-7 text-ui [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 min-w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
