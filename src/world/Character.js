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

// Speed window over which walk hands off to run. The top of it sits under the
// 8 m/s base speed so ordinary walking is already a run cycle — 8 m/s is a
// sprint in real terms, and the corridor is 104 metres long.
const RUN_BLEND = { from: 3.2, to: 7.0 }

// Below this the character is standing still, not creeping.
const MOVE_BLEND = { from: 0.3, to: 1.9 }

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
    this.air = 0
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
    }

    // The jump action is never advanced by the mixer — it is posed by hand from
    // vertical velocity, so a long fall holds the falling frame instead of
    // running off the end of a one-second clip.
    if (this.actions.jump) this.actions.jump.paused = true

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
    if (!this.ready) return

    // Eased rather than switched: a single frame of lost ground contact on a
    // doorway lip should not snap the character into a jump pose.
    this.air = damp(this.air, grounded ? 0 : 1, 12, delta)

    const moving = smoothstep(MOVE_BLEND.from, MOVE_BLEND.to, speed)
    const running = smoothstep(RUN_BLEND.from, RUN_BLEND.to, speed)
    const ground = 1 - this.air

    this.weigh('idle', (1 - moving) * ground)
    this.weigh('walk', moving * (1 - running) * ground)
    this.weigh('run', moving * running * ground)
    this.weigh('jump', this.air)

    // Stride length scales with speed, within limits that keep the clip from
    // strobing at a sprint or crawling to a halt as it fades out.
    this.rate('walk', speed / WALK_CLIP_SPEED, 0.6, 2.4)
    this.rate('run', speed / RUN_CLIP_SPEED, 0.7, 1.9)

    const jump = this.actions.jump
    if (jump) {
      const pose = verticalVelocity > 0 ? AIR_POSE.rising : AIR_POSE.falling
      jump.time = jump.getClip().duration * pose
    }

    this.mixer.update(delta)
  }

  weigh(key, weight) {
    this.actions[key]?.setEffectiveWeight(weight)
  }

  rate(key, value, min, max) {
    const action = this.actions[key]
    if (action) action.setEffectiveTimeScale(Math.min(max, Math.max(min, value)))
  }
}

function mix(a, b, t) {
  return `#${new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()}`
}
