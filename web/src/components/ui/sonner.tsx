"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/*
 * App-wide messages only (an inbox decision speaks in the inbox's status line): one line at the
 * bottom left, never over a reading pane; 200 ms in, 120 ms out (globals.css); no close button, no
 * icons but the spinner of a pending one.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={(resolvedTheme ?? "system") as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-left"
      closeButton={false}
      gap={8}
      visibleToasts={3}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--width": "min(26rem, calc(100vw - 2rem))",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
