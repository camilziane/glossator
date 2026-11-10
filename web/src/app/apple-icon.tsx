import { ImageResponse } from "next/og"

import { iconSvg } from "./icon-svg"

/**
 * The home-screen icon (180 px PNG): the mark without its frame (the system rounds the corners). Its
 * id carries the extension, so the export writes `out/apple-icon/mark.png` (see icon.tsx).
 */

export const dynamic = "force-static"

const size = { width: 180, height: 180 }

export function generateImageMetadata() {
  return [{ id: "mark.png", contentType: "image/png", size }]
}

export default function AppleIcon() {
  const svg = iconSvg({ size: 180, frame: false, scheme: "light" })
  return new ImageResponse(
    <img
      alt=""
      width={180}
      height={180}
      src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
    />,
    size
  )
}
