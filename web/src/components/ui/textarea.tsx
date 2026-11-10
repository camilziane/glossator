import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-sans text-base transition-colors duration-150 placeholder:text-muted-foreground focus-visible:-outline-offset-1 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-danger md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
