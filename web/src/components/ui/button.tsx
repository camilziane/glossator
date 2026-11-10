import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

/*
 * Buttons are quiet: a hairline and ink text, never a fill of ink (a slab of light in dark mode). One
 * main action per view may be `solid`: a 1 px ink outline and semibold ink words. Hover never
 * lightens a control; pressed is darker than hover and sinks half a pixel (small buttons scale to
 * 0.98 instead). Focus is the app's one outline (globals.css), never a ring.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-clip-padding font-sans text-sm font-medium whitespace-nowrap select-none [transition:transform_80ms_var(--ease-out),background-color_120ms_var(--ease-out),border-color_120ms_var(--ease-out),color_120ms_var(--ease-out),text-decoration-color_120ms_var(--ease-out)] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-danger [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        /** Quiet: a hairline, ink text. The default for every action. */
        default:
          "border-rule-strong bg-transparent text-foreground hover:border-input active:border-foreground/70 active:bg-muted aria-expanded:border-input aria-expanded:bg-muted",
        /** The one main action of a view: a 1 px ink outline, semibold ink words, no fill. */
        solid:
          "border-foreground bg-transparent font-semibold text-foreground hover:bg-muted active:bg-[color-mix(in_oklab,var(--muted),var(--foreground)_7%)] aria-expanded:bg-muted",
        /** The same as `default` (shadcn's name). */
        outline:
          "border-rule-strong bg-transparent text-foreground hover:border-input active:border-foreground/70 active:bg-muted aria-expanded:border-input aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_6%)] active:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_11%)] aria-expanded:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_6%)]",
        ghost:
          "text-foreground hover:bg-muted active:bg-[color-mix(in_oklab,var(--muted),var(--foreground)_7%)] aria-expanded:bg-muted",
        /** A text link: ink with a rubric underline that firms on hover. */
        link: "border-0 px-0 text-foreground underline decoration-[color-mix(in_oklab,var(--rubric)_55%,transparent)] decoration-1 underline-offset-[0.18em] hover:decoration-rubric",
        /** Danger words, with the hairline of a quiet button. */
        destructive:
          "border-rule-strong bg-transparent text-danger hover:border-danger/60 active:border-danger active:bg-danger-soft",
      },
      size: {
        default:
          "h-8 px-3 active:not-aria-[haspopup]:translate-y-[0.5px] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
        xs: "h-6 gap-1 px-2 text-xs active:not-aria-[haspopup]:scale-[0.98] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 text-ui active:not-aria-[haspopup]:scale-[0.98] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-2 px-4 active:not-aria-[haspopup]:translate-y-[0.5px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8 active:not-aria-[haspopup]:translate-y-[0.5px]",
        "icon-xs":
          "size-6 active:not-aria-[haspopup]:scale-[0.98] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 active:not-aria-[haspopup]:scale-[0.98]",
        "icon-lg": "size-9 active:not-aria-[haspopup]:translate-y-[0.5px]",
      },
    },
    compoundVariants: [
      // A link is text: no box, no press.
      { variant: "link", className: "h-auto px-0 has-data-[icon]:px-0 active:translate-y-0 active:scale-100" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
