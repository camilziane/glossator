"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import { CheckIcon, MinusIcon } from "lucide-react"

/** A 16 px box with a >= 3:1 edge; its hit area is 32 px (44 px under a coarse pointer). */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[3px] border border-input bg-transparent text-primary-foreground transition-colors duration-150 after:absolute after:-inset-2 hover:border-foreground/70 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger data-checked:border-primary data-checked:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary pointer-coarse:after:-inset-[14px]",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        {props.checked === "indeterminate" ? (
          <MinusIcon aria-hidden strokeWidth={2.5} />
        ) : (
          <CheckIcon aria-hidden strokeWidth={2.5} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
