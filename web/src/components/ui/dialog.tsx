"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/**
 * How a dialog comes and goes: `dialog` fades in at 0.98 scale (200 ms, out 120 ms); `instant` (the
 * ⌘K palette) opens at once and fades out in 90 ms.
 */
type DialogMotion = "dialog" | "instant"

function DialogOverlay({
  className,
  motion = "dialog",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay> & { motion?: DialogMotion }) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      data-motion={motion}
      className={cn(
        "fixed inset-0 isolate z-50",
        // The palette keeps the page in sight: a lighter scrim than a dialog's.
        motion === "instant"
          ? "bg-[oklch(0.22_0.012_60/0.18)] dark:bg-[oklch(0.08_0.005_60/0.45)]"
          : "bg-[oklch(0.15_0.01_60/0.28)] dark:bg-[oklch(0.08_0.005_60/0.6)]",
        motion === "dialog"
          ? "data-open:animate-[fade-in_200ms_var(--ease-out)_both] data-closed:animate-[fade-out_120ms_var(--ease-in)_both]"
          : "data-closed:animate-fade-out",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  motion,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /** `instant` for the palette; a dialog holding a cmdk palette is instant anyway. */
  motion?: DialogMotion
}) {
  return (
    <DialogPortal>
      <DialogOverlay motion={motion} />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        data-motion={motion}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg bg-popover p-5 font-sans text-sm text-popover-foreground shadow-popover focus-visible:outline-none sm:max-w-sm",
          motion === "instant"
            ? "data-closed:animate-fade-out"
            : "data-open:animate-dialog-in data-closed:animate-dialog-out has-[[cmdk-root]]:data-open:animate-none has-[[cmdk-root]]:data-closed:animate-fade-out",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button>Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-serif text-read font-semibold text-balance",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:link",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
