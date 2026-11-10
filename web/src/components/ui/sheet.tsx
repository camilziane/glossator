"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Dialog as SheetPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-[oklch(0.15_0.01_60/0.28)] data-open:animate-[fade-in_200ms_var(--ease-out)_both] data-closed:animate-[fade-out_120ms_var(--ease-in)_both] dark:bg-[oklch(0.08_0.005_60/0.6)]",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  /** `bottom` is the phone's sheet ("Views & filters"); `right` the drawer. */
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "fixed z-50 flex flex-col gap-4 bg-popover font-sans text-sm text-popover-foreground shadow-popover focus-visible:outline-none",
          // Right and left: a drawer (440 px at most). Bottom: the phone's sheet (85 % of the screen at
          // most, above the home indicator). Top: a bar.
          "data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-[min(27.5rem,calc(100%-2.5rem))] data-[side=right]:border-l",
          "data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-[min(22rem,calc(100%-2.5rem))] data-[side=left]:border-r",
          "data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:max-h-[85svh] data-[side=bottom]:overflow-y-auto data-[side=bottom]:rounded-t-lg data-[side=bottom]:border-t data-[side=bottom]:pb-[env(safe-area-inset-bottom)]",
          "data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b",
          "data-[side=right]:data-open:animate-[sheet-in-right_200ms_var(--ease-out)_both] data-[side=right]:data-closed:animate-[sheet-out-right_120ms_var(--ease-in)_both]",
          "data-[side=left]:data-open:animate-[sheet-in-left_200ms_var(--ease-out)_both] data-[side=left]:data-closed:animate-[sheet-out-left_120ms_var(--ease-in)_both]",
          "data-[side=bottom]:data-open:animate-[sheet-in-bottom_200ms_var(--ease-out)_both] data-[side=bottom]:data-closed:animate-[sheet-out-bottom_120ms_var(--ease-in)_both]",
          "data-[side=top]:data-open:animate-[sheet-in-top_200ms_var(--ease-out)_both] data-[side=top]:data-closed:animate-[sheet-out-top_120ms_var(--ease-in)_both]",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-serif text-read font-semibold text-foreground",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
