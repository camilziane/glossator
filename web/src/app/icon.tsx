import { ImageResponse } from "next/og"

import { iconSvg } from "./icon-svg"

/*
 * The favicon, built from APP_NAME at build time (static files in the export): an SVG that follows
 * the colour scheme, and a 32 px PNG for browsers without SVG icons. The ids carry the file's
 * extension: the export writes `out/icon/mark.svg`, which `glossator serve` (and any static host) serves
 * with its type; an extensionless file would go out as application/octet-stream.
 */

export const dynamic = "force-static"

export function generateImageMetadata() {
  return [
    { id: "mark.svg", contentType: "image/svg+xml" },
    { id: "mark.png", contentType: "image/png", size: { width: 32, height: 32 } },
  ]
}

export default async function Icon({ id }: { id: Promise<string> }) {
  if ((await id) === "mark.svg") {
    return new Response(iconSvg({ size: 32 }), {
      headers: { "Content-Type": "image/svg+xml" },
    })
  }
  return new ImageResponse(
    <img alt="" width={32} height={32} src={svgDataUri(iconSvg({ size: 32, scheme: "light" }))} />,
    { width: 32, height: 32 }
  )
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
}
