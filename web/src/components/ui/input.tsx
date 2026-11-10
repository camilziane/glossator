import * as React from "react"
import { cn } from "@/lib/utils"

/** A text field: a >= 3:1 edge, the focus outline drawn on it (offset -1 px). */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 font-sans text-base transition-colors duration-150 file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:-outline-offset-1 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-danger md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
