import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { matcapMaterial } from './Materials.js'

// The visible player: a rigged GLB with baked clips, blended by how fast the
// character controller is actually moving.
//
// Model: "RobotExpressive" by Tomás Laulhé (quaternius), CC0, modifications by
// Don McCurdy. See public/models/README.md. It is used here for three reasons
// that matter more than its looks: it is 464 kB, it is CC0 so nothing has to be
// attributed in the UI, and it ships flat untextured materials — which convert
// to matcap exactly, so the character lands in the same lightless world as the
// level instead of dragging in the lights nothing else in this project has.

const MODEL_URL = 'models/character.glb'

// Kept in step with SPECS.player in Materials.js: the capsule this model
// replaces was this colour, and so is the Games wing's accent.
const PLAYER_COLOR = '#f0913c'

// Match the capsule collider: 2 * (HALF_HEIGHT + RADIUS) from Player.js. The
// GLB is scaled to this rather than trusted, so swapping the model for another
// one is a one-line change instead of a re-tune.
const TARGET_HEIGHT = 1.8

// The player's local forward is -Z (Player.js aims the mesh with
// `atan2(vx, vz) + PI`). The robot is authored facing +Z, so it turns around.
const MODEL_FACING = Math.PI

// Ground speed each locomotion clip looks natural at. Playback is scaled by the
// real speed over these, which is what keeps the feet from skating: at 8 m/s
// the walk clip alone would slide, and the run clip alone would moonwalk at 2.
const WALK_CLIP_SPEED = 1.7
const RUN_CLIP_SPEED = 6.5

// Limits on that scaling, so a clip neither strobes at a sprint nor crawls to a
// halt as it fades out. Expressed in cycles-per-natural-cycle.
const WALK_RATE = { min: 0.6, max: 2.4 }
const RUN_RATE = { min: 0.7, max: 1.9 }

// Where the run cycle sits relative to the walk cycle. Both clips start on the
// same foot, so 0 lines them up; it exists as a dial because a swapped model
// with a differently-authored run is a one-number fix rather than a re-rig.
const RUN_PHASE_OFFSET = 0

// Where in the gait cycle the feet land, and how much of a stride has to be
// blended in before those landings are audible.
//
// A locomotion cycle carries TWO footfalls — left and right, half a cycle
// apart — so a footstep sound belongs on every crossing of a half-cycle
// boundary and nowhere else. FOOTFALL_OFFSET slides both onto the clip's
// contact frame if a swapped model authors its cycle from mid-stride.
//
// The weight gate matters more than it looks: cadence has a floor
// (WALK_RATE.min), so the phase keeps turning at a standstill and holds the
// idle-to-walk blend ready. Those turns must not be heard.
const FOOTFALL_OFFSET = 0
const FOOTFALL_MIN_WEIGHT = 0.5

// Speed window over which walk hands off to run. The top of it sits under the
// 8 m/s base speed so ordinary walking is already a run cycle — 8 m/s is a
// sprint in real terms, and the corridor is 104 metres long.
const RUN_BLEND = { from: 3.2, to: 7.0 }

// Below this the character is standing still, not creeping.
const MOVE_BLEND = { from: 0.3, to: 1.9 }

// How fast the animation's idea of speed chases the controller's. The
// controller's `speed` is what the solver *allowed* last frame, so it ripples
// by a few percent every frame — a wall graze, an autostep, a snap-to-ground
// nudge all shave a little off. Feeding that raw into blend weights and stride
// rate is what made the legs buzz. Reaching ~95% in a fifth of a second is far
// quicker than the body can accelerate, so nothing here lags visibly.
const SPEED_SMOOTHING = 14

// Frames of the Jump clip held as the airborne pose: one on the way up, one on
// the way down. The clip is a one-shot takeoff-to-landing, so playing it
// straight would land the character in mid-air; freezing it at two poses reads
// correctly for a jump of any height.
const AIR_POSE = { rising: 0.30, falling: 0.55 }

const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
const damp = (current, target, lambda, delta) =>
  current + (target - current) * (1 - Math.exp(-lambda * delta))

export default class Character {
  // `parent` is the player's root group; the model hangs off it at the capsule's
  // feet, so the physics body stays the thing that moves and this only ever
  // follows it.
  constructor(parent, { onReady } = {}) {
    this.group = new THREE.Group()
    this.group.rotation.y = MODEL_FACING
    this.group.visible = false
    parent.add(this.group)

    this.mixer = null
    this.actions = {}
    this.durations = {}
    this.air = 0
    // Smoothed copy of the controller's speed, and the shared gait phase the
    // locomotion clips are posed from. See update().
    this.speed = 0
    this.phase = 0
    // Footfalls the gait crossed this frame; read by whatever wants to sound
    // them. See update().
    this.footfalls = 0
    this.ready = false

    new GLTFLoader().load(
      `${import.meta.env.BASE_URL}${MODEL_URL}`,
      (gltf) => {
        this.build(gltf)
        onReady?.()
      },
      undefined,
      (error) => {
        // The capsule stays visible and the game stays playable. A missing
        // character model must never be the reason the showroom does not boot.
        console.warn('[character] could not load the model, keeping the capsule', error)
      },
    )
  }

  build(gltf) {
    const model = gltf.scene

    model.traverse((child) => {
      if (!child.isMesh) return
      child.material = this.matcapFor(child.material)
      // Skinned bounds are computed from the bind pose, so an arm thrown wide
      // mid-clip can cull the whole mesh. Fourteen meshes; not worth the risk.
      child.frustumCulled = false
    })

    // Scale to the collider rather than to a number read off the model, and
    // seat the feet at the bottom of the capsule.
    const bounds = new THREE.Box3().setFromObject(model)
    const size = new THREE.Vector3()
    bounds.getSize(size)
    const scale = TARGET_HEIGHT / (size.y || 1)
    model.scale.setScalar(scale)
    model.position.y = -TARGET_HEIGHT / 2 - bounds.min.y * scale

    this.group.add(model)
    this.group.visible = true

    this.mixer = new THREE.AnimationMixer(model)
    const clip = (name) => gltf.animations.find((a) => a.name === name)

    for (const [key, name] of Object.entries({
      idle: 'Idle', walk: 'Walking', run: 'Running', jump: 'Jump',
    })) {
      const found = clip(name)
      if (!found) continue
      const action = this.mixer.clipAction(found)
      action.enabled = true
      action.setEffectiveWeight(key === 'idle' ? 1 : 0)
      action.play()
      this.actions[key] = action
      this.durations[key] = found.duration
    }

    // Everything except the idle breath is posed by hand rather than advanced
    // by the mixer. A paused action still contributes its pose at whatever
    // `action.time` says, which is the whole mechanism this class runs on:
    //
    //  - jump, because the clip is a one-shot takeoff-to-landing and playing it
    //    straight would land the character in mid-air; freezing it at two poses
    //    reads correctly for a fall of any length.
    //  - walk and run, because they have to stay in step with EACH OTHER. Left
    //    to the mixer they run at two different speed-scaled rates and drift
    //    apart within a second or two, and the blend between them then averages
    //    a left step against a right one. That is the jitter: not noise in the
    //    numbers, two gait cycles fighting. Posing both from one shared phase
    //    means the blend is always between matching points of the same stride.
    for (const key of ['jump', 'walk', 'run']) {
      if (this.actions[key]) this.actions[key].paused = true
    }

    this.ready = true
  }

  // The GLB's three materials are flat colours with no textures, so each one
  // becomes a matcap built from that same colour and the scene keeps its single
  // shading model. The body colour is pinned to the palette's player orange
  // rather than the model's own, so the character reads as *the player* in the
  // colour the rest of the UI already uses for them.
  matcapFor(source) {
    const isBody = source.name === 'Main'
    const base = isBody ? PLAYER_COLOR : `#${source.color.getHexString()}`
    return matcapMaterial(`character:${source.name}:${base}`, {
      base,
      rim: mix(base, '#ffffff', 0.55),
      ambient: 0.5,
      key: 0.66,
      fill: 0.24,
      rimGain: 0.6,
      shininess: 30,
      specGain: isBody ? 0.4 : 0.26,
    })
  }

  // `speed` is planar m/s, `verticalVelocity` signs the airborne pose.
  update(delta, { speed = 0, grounded = true, verticalVelocity = 0 } = {}) {
    this.footfalls = 0
    if (!this.ready) return

    // Eased rather than switched: a single frame of lost ground contact on a
    // doorway lip should not snap the character into a jump pose.
    this.air = damp(this.air, grounded ? 0 : 1, 12, delta)

    // Everything below reads the smoothed speed, never the raw one.
    this.speed = damp(this.speed, speed, SPEED_SMOOTHING, delta)
    const pace = this.speed

    const moving = smoothstep(MOVE_BLEND.from, MOVE_BLEND.to, pace)
    const running = smoothstep(RUN_BLEND.from, RUN_BLEND.to, pace)
    const ground = 1 - this.air

    this.weigh('idle', (1 - moving) * ground)
    this.weigh('walk', moving * (1 - running) * ground)
    this.weigh('run', moving * running * ground)
    this.weigh('jump', this.air)

    // One cadence for both clips, in gait cycles per second. Each clip's own
    // rate is speed over the speed it was authored at — that is what keeps the
    // feet from skating — and the two are blended by the same `running` weight
    // the poses are, so cadence and pose cross over together. Advancing a
    // single phase by it is what holds the legs in step.
    const cadence =
      lerp(this.cyclesPerSecond('walk', pace / WALK_CLIP_SPEED, WALK_RATE),
           this.cyclesPerSecond('run', pace / RUN_CLIP_SPEED, RUN_RATE),
           running)

    // Airborne, the phase is held rather than advanced: the locomotion clips
    // are silent up there anyway, and freezing means you land on the foot you
    // took off from instead of wherever a half-second of flight ran the cycle.
    const advanced = this.phase + cadence * delta * ground

    // Count the half-cycles the stride just crossed, BEFORE wrapping — the wrap
    // is what makes "did it pass a boundary?" awkward to ask afterwards. At any
    // reachable cadence this is 0 or 1 per frame; it is counted rather than
    // tested so a long frame owes the same number of steps as two short ones.
    if (moving * ground > FOOTFALL_MIN_WEIGHT) {
      this.footfalls =
        Math.floor((advanced - FOOTFALL_OFFSET) * 2) -
        Math.floor((this.phase - FOOTFALL_OFFSET) * 2)
    }

    this.phase = fract(advanced)

    this.pose('walk', this.phase)
    this.pose('run', this.phase + RUN_PHASE_OFFSET)
    this.pose('jump', verticalVelocity > 0 ? AIR_POSE.rising : AIR_POSE.falling)

    this.mixer.update(delta)
  }

  weigh(key, weight) {
    this.actions[key]?.setEffectiveWeight(weight)
  }

  // Natural cycles per second for one clip at `rate` times its authored speed.
  cyclesPerSecond(key, rate, limits) {
    const duration = this.durations[key]
    if (!duration) return 0
    return Math.min(limits.max, Math.max(limits.min, rate)) / duration
  }

  // Place a paused action at a fraction of its clip.
  pose(key, phase) {
    const action = this.actions[key]
    if (action) action.time = fract(phase) * this.durations[key]
  }
}

const lerp = (a, b, t) => a + (b - a) * t
const fract = (x) => x - Math.floor(x)

function mix(a, b, t) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`
}
