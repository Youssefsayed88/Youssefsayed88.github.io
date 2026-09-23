import Time from '../core/Time.js'
import Input from '../core/Input.js'
import Hud from '../ui/Hud.js'
import Bubble from '../ui/Bubble.js'
import Rail from '../ui/Rail.js'
import Modal from '../ui/Modal.js'
import Chat from '../ui/Chat.js'
import Audio from '../ui/Audio.js'
import Level from './Level.js'
import Camera from './Camera.js'
import Avatar from './Avatar.js'
import { createBody, stepBody } from './physics.js'
import { BODY_HALF_WIDTH, PLAYER_HEIGHT } from './movement.js'
import { projects, WINGS } from '../data/projects.js'
import { PROJECT_PARAM } from '../core/params.js'
import { track } from '../core/analytics.js'

// Standing still on a project for this long opens it. Long enough to read the
// bubble and move on; short enough that waiting is a way in.
export const DWELL = 1.4

// "Still", in px/s. The walk brakes to a stop in ~0.1 s, so this is only the
// tail of it.
const STILL = 12

// Where on the spawn block the robot arrives, from its left edge, and from how
// high it drops in.
const SPAWN_INSET = 56
const SPAWN_DROP = 90

// How close to the portal counts as at it, either side.
const PORTAL_REACH = 18

// The robot shrinks into the portal before the camera leaves.
const WARP_OUT = 0.22

// Landings harder than this make a sound. A hop onto the next tag should not.
const LOUD_LANDING = 700

const wingLabel = new Map(WINGS.map((w) => [w.id, w.label]))

export default class Game {
  constructor(root) {
    this.root = root
    this.time = new Time()
    this.input = new Input()
    this.level = new Level(root)
    this.camera = new Camera(this.level)
    this.avatar = new Avatar(root)
    this.audio = new Audio()
    this.hud = new Hud()
    this.rail = new Rail(document.getElementById('rail'), { onSelect: (id) => this.teleport(id) })

    // The touch Open button is the E key's counterpart, so it lights off the
    // same target the bubble does.
    this.bubble = new Bubble(root, {
      onTarget: (target) => this.input.touch.setPrompt(target),
      onActivate: () => this.interact(),
    })

    this.modal = new Modal((open, project) => {
      // The panel covers the screen; a joystick left under it would hold
      // whatever direction the thumb was last pushing.
      this.input.touch.setVisible(!open && !this.chat.isOpen)
      // The address bar tracks whatever is on screen, so copying it shares that
      // project. replaceState, not push: a back button that stepped through
      // every thumbnail someone stood on would be a worse back button.
      this.setUrlProject(open ? project.id : null)
      open ? this.audio.openPanel() : this.audio.closePanel()
    })

    this.projects = new Map(projects.map((p) => [p.id, p]))

    // The chatbot, when the build has one (see src/chat/config.js). Its bar
    // sits where the touch controls are, so they make way while it is open.
    this.chat = new Chat(root, {
      projects: new Map(projects.map((p) => [p.id, p.title])),
      onProject: (id) => this.showProject(id),
      onToggle: (open) => this.input.touch.setVisible(!open && !this.modal.open),
      isBlocked: () => this.modal.open,
    })
    this.target = null
    this.dwell = 0
    // The project whose panel was just open. Standing on it does not re-open it
    // until the robot has stood somewhere else.
    this.dismissed = null
    this.warping = false
    this.arriving = false
    // The sections the robot has been in, each counted once: how far down the
    // level a visitor got.
    this.reached = new Set()

    this.body = this.spawnBody()

    this.input.on('interact', () => this.interact())
    this.input.on('chat', () => { if (!this.paused) this.chat.toggle('key') })

    // The thumbnails are buttons too: a visitor with a mouse can click one open
    // without playing at all.
    root.addEventListener('click', (event) => {
      const control = event.target.closest('a, button')
      // A pointer click leaves focus on what was clicked, and a focused button
      // takes the next Space as a second click instead of a jump.
      if (control && event.detail > 0) control.blur()

      const thumb = event.target.closest('[data-project]')
      if (thumb) this.openProject(thumb.dataset.project)
    })
    root.querySelector('#portal')?.addEventListener('click', () => this.warp())

    this.level.on('remeasure', (before) => this.reanchor(before))

    // Browsers refuse to start audio outside a user gesture.
    const wake = () => this.audio.start()
    window.addEventListener('keydown', wake, { once: true })
    window.addEventListener('pointerdown', wake, { once: true })

    this.camera.snap(this.body)
    this.avatar.update(this.body, 0)

    this.openDeepLink()

    this.time.on('tick', () => this.update())
  }

  get paused() {
    return this.modal.open
  }

  spawnBody() {
    const spawn = this.level.spawn
    const x = Math.min(spawn.left + SPAWN_INSET, (spawn.left + spawn.right) / 2)
    return createBody(x, spawn.top - SPAWN_DROP)
  }

  update() {
    const delta = this.time.delta
    const input = this.input
    input.update()

    if (!this.paused && !this.warping) {
      const step = stepBody(this.body, {
        move: input.move,
        sprint: input.sprint,
        jump: input.jump,
        drop: input.drop,
      }, this.level.platforms, this.level.bounds, delta)

      this.body = step.body
      if (step.lost) this.body = this.spawnBody()
      if (step.jumped) this.audio.jump()
      if (step.impact > LOUD_LANDING) this.audio.land(step.impact)
      if (input.move || input.jump || input.drop) this.hud.hideHint()

      this.updateTarget(delta)
      this.enterSection(this.level.sectionAt(this.body.y))
      this.rail.update(this.body.y, this.level.sections)
    }

    this.avatar.update(this.body, delta)
    if (!this.paused && this.body.grounded) {
      for (let i = 0; i < this.avatar.footfalls; i++) this.audio.footstep()
    }

    // The bubble follows the robot along the thumbnail, and the camera keeps it
    // on screen along with the feet. While the chat is open its bubble is the
    // one over the robot's head, and the feet stay above its input bar.
    this.bubble.tick(delta)
    this.bubble.place(this.speaker(), this.level.bounds)
    this.chat.place(this.speaker(), this.level.bounds, this.chatRoom())
    this.camera.keepVisible = this.chat.isOpen ? this.chat.box : this.bubble.box
    this.camera.reserveBottom = this.chat.reserve
    this.camera.update(this.body, delta)

    // The portal's flight is over once the camera has reached the top: the
    // robot reappears and drops onto the name.
    if (this.arriving && this.camera.settled) {
      this.arriving = false
      this.warping = false
      this.avatar.setWarping(false)
    }
  }

  // What the robot is standing at, and the bubble and dwell that follow from it.
  updateTarget(delta) {
    const body = this.body

    // The chat has the robot's voice while it is open: no project bubble to
    // talk over it, and no dwell to throw a panel open mid-answer.
    if (this.chat.isOpen) {
      if (this.target) {
        this.target.el?.classList.remove('is-target')
        this.target = null
        this.bubble.hide()
      }
      this.dwell = 0
      return
    }

    const platform = body.grounded ? this.level.byId.get(body.on) : null

    let next = null
    if (platform?.project && this.projects.has(platform.project)) {
      next = { kind: 'project', key: platform.id, el: platform.el, project: this.projects.get(platform.project) }
    } else if (platform?.solid && this.level.portal) {
      const portal = this.level.portal
      if (body.x > portal.left - PORTAL_REACH && body.x < portal.right + PORTAL_REACH) {
        next = { kind: 'portal', key: 'portal' }
      }
    }

    if ((next?.key ?? null) !== (this.target?.key ?? null)) {
      // The thumbnail underfoot is marked, so which picture is talking is never
      // in doubt.
      this.target?.el?.classList.remove('is-target')
      next?.el?.classList.add('is-target')
      this.target = next
      this.dwell = 0
      if (next?.key !== this.dismissed) this.dismissed = null
      if (next) {
        this.bubble.show(describe(next), this.speaker(), this.level.bounds)
        this.audio.target()
      } else {
        this.bubble.hide()
      }
    }

    const waiting = next?.kind === 'project' && next.key !== this.dismissed
      && Math.abs(body.vx) < STILL && !this.input.move
    this.dwell = waiting ? this.dwell + delta : 0
    this.bubble.setDwell(this.dwell / DWELL)

    if (this.dwell >= DWELL) this.interact()
  }

  enterSection(section) {
    if (!section) return
    this.hud.setRoom(section.label)
    // The ground at the foot has no id of its own; `#portal` is its button.
    const id = section.id || section.label.toLowerCase()
    if (this.reached.has(id)) return
    this.reached.add(id)
    track('reach-section', { section: id })
  }

  // What the chat bubble needs to decide whether it fits over the robot's head.
  chatRoom() {
    return { feet: this.body.y, origin: this.level.origin.top, room: this.camera.reserveTop }
  }

  // Where the bubble points: the middle of the robot and the top of its head.
  speaker() {
    return { x: this.body.x, top: this.body.y - PLAYER_HEIGHT }
  }

  interact() {
    if (this.paused || this.warping || !this.target) return
    if (this.target.kind === 'portal') this.warp()
    else this.openProject(this.target.project.id)
  }

  openProject(id) {
    const project = this.projects.get(id)
    if (!project || this.paused) return

    if (this.target?.project?.id === id) this.dismissed = this.target.key
    this.dwell = 0
    this.bubble.setDwell(0)
    // Stop where it stands, or the robot runs on the spot behind the panel.
    this.body = { ...this.body, vx: 0 }
    this.modal.show(project)
    track('open-project', { project: id })
  }

  // The portal: out of sight at the bottom, a flight up the whole page, and a
  // drop back onto the name.
  warp() {
    if (this.warping || this.paused) return
    track('portal')
    this.vanish((reduced) => {
      this.body = this.spawnBody()
      if (reduced) this.camera.snap(this.body)
      else this.camera.fly()
    })
  }

  // A section picked on the rail: out of sight where it stands, and back in on
  // that section's first platform, the camera cut straight there.
  teleport(sectionId) {
    if (this.warping || this.paused) return
    this.vanish(() => {
      const first = document.getElementById(sectionId)?.querySelector('[data-platform]')
      const platform = first && this.level.byId.get(first.dataset.platform)
      if (platform) {
        const x = Math.min(platform.left + SPAWN_INSET, (platform.left + platform.right) / 2)
        this.body = createBody(x, platform.top, platform.id)
      }
      this.camera.snap(this.body)
    })
  }

  // The robot shrinks out of sight, then `place` moves it and the camera. It
  // reappears once the camera has arrived; see update().
  vanish(place) {
    this.warping = true
    this.target?.el?.classList.remove('is-target')
    this.target = null
    this.bubble.hide()
    this.audio.warp()
    this.avatar.setWarping(true)

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setTimeout(() => {
      place(reduced)
      this.arriving = true
    }, reduced ? 0 : WARP_OUT * 1000)
  }

  // Keep the robot on the block it was standing on when the layout moves, at the
  // same fraction of the way along it — and the bubble over its head.
  reanchor(before) {
    const body = this.body
    if (body.on !== null) {
      const was = before.get(body.on)
      const now = this.level.byId.get(body.on)
      if (was && now) {
        const along = was.right > was.left ? (body.x - was.left) / (was.right - was.left) : 0.5
        this.body = { ...body, x: now.left + along * (now.right - now.left), y: now.top }
      } else {
        // Its block no longer exists at this width.
        this.body = this.spawnBody()
      }
    } else {
      const { left, right } = this.level.bounds
      this.body = { ...body, x: Math.min(right - BODY_HALF_WIDTH, Math.max(left + BODY_HALF_WIDTH, body.x)) }
    }

    if (this.target) {
      this.bubble.measure()
      this.bubble.place(this.speaker(), this.level.bounds)
    }
    if (this.chat.isOpen) {
      this.chat.measure()
      this.chat.place(this.speaker(), this.level.bounds, this.chatRoom())
    }
  }

  // A project the chatbot pointed at: the robot to its thumbnail, and its panel
  // open. The chat stays open behind it, to carry on after.
  showProject(id) {
    const platform = this.level.platformForProject(id)
    if (!platform || this.paused || this.warping) return
    this.body = createBody((platform.left + platform.right) / 2, platform.top, platform.id)
    this.camera.snap(this.body)
    this.avatar.update(this.body, 0)
    this.enterSection(this.level.sectionAt(this.body.y))
    this.openProject(id)
  }

  // `?project=<id>` stands the robot on that thumbnail with its panel open, the
  // camera already there. A stale id lands at the top instead of on an error.
  openDeepLink() {
    const id = new URLSearchParams(window.location.search).get(PROJECT_PARAM)
    if (!id) return

    const platform = this.level.platformForProject(id)
    if (!platform) {
      this.setUrlProject(null)
      return
    }

    this.body = createBody((platform.left + platform.right) / 2, platform.top, platform.id)
    this.camera.snap(this.body)
    this.avatar.update(this.body, 0)
    this.updateTarget(0)
    // The panel opens at once, and the loop does not look at sections while it
    // is up.
    this.enterSection(this.level.sectionAt(this.body.y))
    this.openProject(id)
    track('deep-link', { project: id })
  }

  setUrlProject(id) {
    try {
      const url = new URL(window.location.href)
      if (id) url.searchParams.set(PROJECT_PARAM, id)
      else url.searchParams.delete(PROJECT_PARAM)
      window.history.replaceState(null, '', url)
    } catch {
      // An opaque origin or a sandboxed frame refuses replaceState. Nothing here
      // depends on the URL, so losing it is not worth an error.
    }
  }
}

// What the bubble says for a target.
function describe(target) {
  if (target.kind === 'portal') {
    return { key: target.key, kind: 'portal', verb: 'Go up', eyebrow: 'Portal', title: 'Back to the top', detail: null }
  }
  const p = target.project
  return {
    key: target.key,
    kind: 'project',
    verb: 'Open',
    eyebrow: [wingLabel.get(p.wing), p.company].filter(Boolean).join(' · '),
    title: p.title,
    detail: p.role,
  }
}
