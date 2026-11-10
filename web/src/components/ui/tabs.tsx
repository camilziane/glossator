"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Tabs as TabsPrimitive } from "radix-ui"

/*
 * Tabs are words: muted ink, the current one in ink with a 2 px ink underline on the row's hairline.
 * No pills, no boxes; a pointer click leaves no ring (the outline is :focus-visible only).
 */
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-3 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-stretch text-muted-foreground group-data-horizontal/tabs:gap-5 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:gap-0.5",
  {
    variants: {
      variant: {
        /** Words on a hairline (the row's rule). */
        default: "group-data-horizontal/tabs:border-b group-data-horizontal/tabs:border-border",
        /** Words without the row's rule (it sits on a rule of its own). */
        line: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  onMouseDown,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      // Radix focuses the tab from its mousedown, a focus by script the browser rings: focus it first
      // without the ring (a pointer's click never leaves one).
      onMouseDown={(e) => {
        onMouseDown?.(e)
        if (!e.defaultPrevented && e.button === 0 && !e.ctrlKey)
          e.currentTarget.focus({ focusVisible: false } as FocusOptions)
      }}
      className={cn(
        "relative -mx-1.5 inline-flex min-h-9 items-center gap-1.5 rounded-sm px-1.5 font-sans text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors duration-150 group-data-vertical/tabs:mx-0 group-data-vertical/tabs:justify-start group-data-vertical/tabs:px-2 hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-active:text-foreground focus-visible:-outline-offset-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity after:duration-150 data-active:after:opacity-100 group-data-horizontal/tabs:after:inset-x-1.5 group-data-horizontal/tabs:after:-bottom-px group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-1 group-data-vertical/tabs:after:left-0 group-data-vertical/tabs:after:w-0.5",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm focus-visible:outline-offset-4", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
