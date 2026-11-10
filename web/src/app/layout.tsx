import "./globals.css"

import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"

import { AppShell } from "@/components/shell/app-shell"
import { Providers } from "@/components/shell/providers"
import { APP_NAME } from "@/lib/site"

import { fontVariables } from "./fonts"

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s — ${APP_NAME}` },
  description: "Every bibliography on this computer: articles, full-text search and the inbox.",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  // The phone's tab bar reaches the screen's edge and pads itself by the safe area.
  viewportFit: "cover",
  // The paper of each theme (the shell then follows the theme chosen in the app: ThemeColor).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f5ed" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1713" },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontVariables}>
      <body className="min-h-svh">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
