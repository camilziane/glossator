import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/*
 * An empty, error or not-found state is a sentence in the serif saying what to do: no dashed box, no
 * big icon (EmptyMedia draws nothing; it stays for compatibility), aligned with the page's text.
 */
function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "flex w-full max-w-(--measure) min-w-0 flex-col items-start gap-3 py-6 text-left",
        className
      )}
      {...props}
    />
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex flex-col items-start gap-1.5", className)}
      {...props}
    />
  )
}

const emptyMediaVariants = cva("hidden", {
  variants: {
    variant: {
      default: "",
      icon: "",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

/** @deprecated States carry no icon: this draws nothing. */
function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      aria-hidden="true"
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn(
        "font-serif text-read font-semibold text-balance text-foreground",
        className
      )}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "font-serif text-base leading-6 text-pretty text-muted-foreground [font-variant-numeric:oldstyle-nums] [&_a]:link [&_a]:text-foreground",
        className
      )}
      {...props}
    />
  )
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full min-w-0 flex-wrap items-center gap-2.5 text-sm",
        className
      )}
      {...props}
    />
  )
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
}
