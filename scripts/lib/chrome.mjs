// Headless Chrome over CDP: launching it, and the minimal protocol client.
//
// Extracted so the two scripts that need a browser share one copy. They need it
// for opposite reasons — verify-browser.mjs drives the built site, and
// encode-images.mjs borrows the canvas as an image encoder — but the plumbing
// to get a page they can eval into is identical, and it is the part with all
// the sharp edges in it (see the profile note below).
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'

const CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

export const chromePath = () => CANDIDATES.find((p) => existsSync(p)) ?? null

// Retries `fn` until it returns something truthy. Used for the two things that
// are ready when they are ready: the debugging port, and the page behind it.
export async function waitFor(fn, label, tries = 60) {
  let last
  for (let i = 0; i < tries; i++) {
    try {
      const value = await fn()
      if (value) return value
    } catch (error) { last = error }
    await sleep(250)
  }
  throw new Error(`timed out after ${(tries * 250) / 1000}s waiting for ${label}` +
    (last ? `\n      last error: ${last.message}` : ''))
}

// Launches Chrome and attaches to its first page target.
//
// A FRESH profile per run, always. Chrome will not open a second debugging port
// on a profile another instance still holds — it silently hands the URL to the
// running instance and exits, leaving the caller waiting forever for a target
// that never appears. A leftover lock from a killed run is enough to cause it.
//
// Spawned WITHOUT shell:true. On Windows a shell spawn puts cmd.exe in between,
// and killing cmd orphans the browser it started.
export async function launchChrome({ port = 9222, args = [] } = {}) {
  const binary = chromePath()
  if (!binary) return null

  const profile = mkdtempSync(join(tmpdir(), 'portfolio-chrome-'))
  const child = spawn(binary, [
    '--headless=new', `--remote-debugging-port=${port}`,
    '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    ...args, 'about:blank',
  ], { stdio: 'ignore' })

  const close = () => {
    try { child.kill() } catch {}
    try { rmSync(profile, { recursive: true, force: true }) } catch {}
  }
  process.on('exit', close)

  try {
    const target = await waitFor(async () => {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      return list.find((t) => t.type === 'page')
    }, 'a Chrome page target')

    const cdp = await Cdp.attach(target.webSocketDebuggerUrl)
    return { cdp, close }
  } catch (error) {
    close()
    throw error
  }
}

// Minimal CDP client: one websocket, id-matched replies.
export class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [] }

  static async attach(url) {
    const ws = new WebSocket(url)
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    const cdp = new Cdp(ws)
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data)
      if (msg.id && cdp.pending.has(msg.id)) {
        const { res, rej } = cdp.pending.get(msg.id)
        cdp.pending.delete(msg.id)
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result)
      } else if (msg.method) cdp.events.push(msg)
    }
    return cdp
  }

  send(method, params = {}) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((res, rej) => this.pending.set(id, { res, rej }))
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true,
    })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'eval threw')
    return r.result.value
  }

  // `code` is what the app reads (e.type/e.code), so it must be set.
  key(type, code, key, keyCode) {
    return this.send('Input.dispatchKeyEvent', {
      type, code, key, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode,
    })
  }
}
