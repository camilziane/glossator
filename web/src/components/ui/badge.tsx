import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/*
 * A badge is a word, not a pill: the serif's small caps in the variant's ink, no fill, no frame.
 * Colour never carries the meaning alone: the word does ("Retracted", "Draft").
 */
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-baseline gap-1 font-serif text-label leading-none font-semibold tracking-[0.05em] whitespace-nowrap [font-variant-caps:all-small-caps] [font-variant-numeric:oldstyle-nums] [&>svg]:pointer-events-none [&>svg]:size-3! [&>svg]:self-center",
  {
    variants: {
      variant: {
        default: "text-foreground",
        secondary: "text-muted-foreground",
        destructive: "text-danger",
        warning: "text-warning",
        success: "text-success",
        outline: "text-foreground",
        ghost: "text-muted-foreground",
        link: "text-foreground underline decoration-[color-mix(in_oklab,var(--rubric)_55%,transparent)] underline-offset-[0.18em] hover:decoration-rubric",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
