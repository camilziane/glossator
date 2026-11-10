import type { NextConfig } from "next"
import { PHASE_DEVELOPMENT_SERVER } from "next/constants"

// The app is built once into out/ (a static export) and served by `glossator serve`, which also answers
// /data/library.json, /library/* and /api/*. In development those three are proxied to a running
// `glossator serve` (GLOSSATOR_SERVE_URL), and each dev server may use its own build dir (NEXT_DIST_DIR) so
// several can run side by side.
export default function nextConfig(phase: string): NextConfig {
  const config: NextConfig = {
    output: "export",
    trailingSlash: true,
    images: { unoptimized: true },
    reactCompiler: true,
    poweredByHeader: false,
    reactStrictMode: true,
    experimental: {
      // Route types (and the check of each page's exports) are imported by next-env.d.ts from
      // whichever build dir wrote it, instead of one tsconfig "include" line per build dir: the
      // tsconfig stays the same whatever NEXT_DIST_DIR a dev server used.
      strictRouteTypes: true,
    },
    // Tailwind CSS v4 compiles the stylesheets (no PostCSS config).
    turbopack: {
      rules: {
        "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
      },
    },
  }
  if (phase !== PHASE_DEVELOPMENT_SERVER) {
    // A custom distDir would also move the export away from out/: builds always use .next/.
    return config
  }
  const upstream = (process.env.GLOSSATOR_SERVE_URL || "http://127.0.0.1:8765").replace(/\/+$/, "")
  return {
    ...config,
    // Rewrites need a server: development only (`output: "export"` ignores them).
    output: undefined,
    distDir: process.env.NEXT_DIST_DIR || ".next",
    // The app is opened at 127.0.0.1 like glossator serve; without this, hot reload is refused.
    allowedDevOrigins: ["127.0.0.1"],
    // /api/search must reach glossator serve as is, not redirected to /api/search/.
    skipTrailingSlashRedirect: true,
    async rewrites() {
      // The proxy rewrites the Host header, so glossator serve's own check cannot see a page reached
      // through another name (DNS rebinding): only requests addressed to this machine by its
      // loopback names are proxied. Next anchors the pattern; the group keeps the alternation whole.
      const has = [{ type: "host" as const, value: "(?:127\\.0\\.0\\.1|localhost)" }]
      return [
        { source: "/data/:path*", destination: `${upstream}/data/:path*`, has },
        { source: "/library/:path*", destination: `${upstream}/library/:path*`, has },
        { source: "/api/:path*", destination: `${upstream}/api/:path*`, has },
      ]
    },
  }
}
