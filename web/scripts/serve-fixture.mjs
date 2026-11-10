#!/usr/bin/env node
/**
 * Serves the built app (out/) through the real `glossator serve`, with a throwaway GLOSSATOR_HOME that holds
 * the synthetic library (tests/fixtures/library.json) and placeholder files for every file it links
 * (figures, PDFs, supplementary files). Used by Playwright's webServer and by `npm run serve:fixture`.
 *
 *   E2E_PORT=8790 node scripts/serve-fixture.mjs
 *
 * Env: E2E_PORT (default 8790), E2E_FIXTURE (another library.json), GLOSSATOR_WEB (another built app).
 * The real library is never read: GLOSSATOR_HOME and GLOSSATOR_LIBRARY both point into the temporary
 * folder. The server runs in a process group of its own: stopping this script (SIGINT, SIGTERM,
 * SIGHUP) stops the whole group, then removes the folder, so no server is left holding the port.
 */
import { spawn } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateSync } from "node:zlib"

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const repo = resolve(web, "..")
const port = process.env.E2E_PORT || "8790"
const fixture = resolve(process.env.E2E_FIXTURE || join(web, "tests/fixtures/library.json"))
const app = resolve(process.env.GLOSSATOR_WEB || join(web, "out"))

if (!existsSync(join(app, "index.html"))) {
  console.error(`No built app in ${app}: run npm run build first.`)
  process.exit(1)
}

// One folder per port: a run killed without its cleanup (SIGKILL) leaves one, and maybe its server,
// which the next run on the same port stops and removes.
const prefix = `glossator-web-fixture-${port}-`
const PID_FILE = "server.pid"
// Only this user's folders: /tmp is shared, and another user's run is none of ours.
const uid = process.getuid?.()
for (const stale of readdirSync(tmpdir()).filter((d) => d.startsWith(prefix))) {
  const dir = join(tmpdir(), stale)
  try {
    if (uid !== undefined && statSync(dir).uid !== uid) continue
  } catch {
    continue
  }
  stopStaleServer(dir)
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // not ours to remove after all (permissions): leave it
  }
}
const home = mkdtempSync(join(tmpdir(), prefix))
const library = join(home, "library")
mkdirSync(join(home, "build", "data"), { recursive: true })
const json = readFileSync(fixture, "utf8")
writeFileSync(join(home, "build", "data", "library.json"), json)

// ---------------------------------------------------------------------------- placeholder files

/** A PNG of one colour (a stand-in figure), written without dependencies. */
function png(width, height, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf) => {
    let c = 0xffffffff
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, "ascii"), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x++) row.set([r, g, b], 1 + x * 3)
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

/** A one-page PDF saying it is a placeholder. */
function pdf(title) {
  const text = `Placeholder for ${title}`.replace(/[()\\]/g, "")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  const stream = `BT /F1 14 Tf 72 770 Td (${text}) Tj ET`
  objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  let out = "%PDF-1.4\n"
  const offsets = []
  objects.forEach((body, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return out
}

const hrefs = new Set()
const walk = (value) => {
  if (typeof value === "string") {
    if (value.startsWith("library/")) hrefs.add(value)
  } else if (Array.isArray(value)) value.forEach(walk)
  else if (value && typeof value === "object") Object.values(value).forEach(walk)
}
walk(JSON.parse(json))
for (const href of hrefs) {
  const rel = href.slice("library/".length)
  if (rel.split("/").some((p) => p === ".." || p.startsWith("."))) continue
  const file = join(library, rel)
  mkdirSync(dirname(file), { recursive: true })
  if (/\.png$/i.test(file)) writeFileSync(file, png(480, 270, [196, 205, 222]))
  else if (/\.pdf$/i.test(file)) writeFileSync(file, pdf(rel))
  else writeFileSync(file, `Placeholder for ${rel}\n`)
}

// ---------------------------------------------------------------------------- the server

/**
 * The group of a server a killed run left behind (Linux: /proc), only when that pid is still the
 * `glossator serve --port <port>` this folder started: its command line says so and its environment
 * holds this folder as GLOSSATOR_HOME (a reused pid is someone else's process).
 */
function stopStaleServer(dir) {
  let pid
  try {
    pid = Number(readFileSync(join(dir, PID_FILE), "utf8").trim())
    if (!Number.isInteger(pid) || pid <= 1) return
    const cmdline = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0")
    const at = cmdline.indexOf("serve")
    if (at < 0 || cmdline[at + 1] !== "--port" || cmdline[at + 2] !== port) return
    const environ = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0")
    if (!environ.includes(`GLOSSATOR_HOME=${dir}`)) return
  } catch {
    return
  }
  try {
    process.kill(-pid, "SIGKILL")
  } catch {
    // already gone
  }
}

// The venv's own `glossator` when there is one (signals reach the server itself), else through uv.
const venvTool = join(repo, ".venv", "bin", "glossator")
const [cmd, ...args] = existsSync(venvTool)
  ? [venvTool]
  : ["uv", "run", "--project", repo, "glossator"]
const child = spawn(cmd, [...args, "serve", "--port", port], {
  env: { ...process.env, GLOSSATOR_HOME: home, GLOSSATOR_LIBRARY: library, GLOSSATOR_WEB: app },
  stdio: "inherit",
  // A process group of its own: uv does not forward signals to its child, so the group is signalled.
  detached: true,
})
writeFileSync(join(home, PID_FILE), String(child.pid))

/** Signal the server's whole group (uv and python alike); false once it is gone. */
function signalGroup(signal) {
  try {
    process.kill(-child.pid, signal)
    return true
  } catch {
    return false
  }
}

let cleaned = false
function cleanup() {
  if (cleaned) return
  cleaned = true
  // Whatever is left of the group goes first: a server must never outlive its library.
  signalGroup("SIGKILL")
  try {
    rmSync(home, { recursive: true, force: true })
  } catch {
    // already gone, or a file the server still holds: the next run on this port removes it
  }
}

let stopping = false
function stop() {
  if (stopping) return
  stopping = true
  if (!signalGroup("SIGINT")) {
    cleanup()
    process.exit(0)
  }
  setTimeout(() => signalGroup("SIGKILL"), 3000).unref()
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, stop)
child.on("exit", (code, signal) => {
  cleanup()
  process.exit(stopping ? 0 : (code ?? (signal ? 1 : 0)))
})
process.on("exit", cleanup)
console.log(`Serving ${app} with the synthetic library on http://127.0.0.1:${port}/`)
