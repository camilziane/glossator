import { cn } from "@/lib/utils"

/**
 * A placeholder in the shape of what is coming: a static wash (no pulse, no shimmer) that appears
 * only after 200 ms, so a fast load shows nothing at all.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("animate-skeleton-in rounded-xs bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
