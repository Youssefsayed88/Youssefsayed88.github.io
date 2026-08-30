# Character model

`character.glb` — "RobotExpressive"

- **Author:** Tomás Laulhé ([quaternius](https://quaternius.com))
- **Modifications:** Don McCurdy
- **Licence:** [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) — public domain
- **Source:** [three.js](https://github.com/mrdoob/three.js) `examples/models/gltf/RobotExpressive/RobotExpressive.glb`

CC0 asks for nothing, so nothing is credited in the UI. This file is the record.

## Why this one

- **464 kB.** The showroom's whole point is that it loads on a phone.
- **No textures.** Three flat colour materials, which convert to matcap exactly —
  so the character shades under the same no-lights, no-shadow-maps model as the
  rest of the level. A typical free PBR rig would have needed lights added for
  one object.
- **The clips that are actually used:** `Idle`, `Walking`, `Running`, `Jump`.
  It also carries `Dance`, `Death`, `No`, `Punch`, `Sitting`, `Standing`,
  `ThumbsUp`, `WalkJump`, `Wave` and `Yes`, which are loaded but unplayed.

## Replacing it

`src/world/Character.js` scales the GLB to `TARGET_HEIGHT` from its own measured
bounds and looks clips up by name, so a different model needs at most two edits:
the name map in `build()`, and `MODEL_FACING` if it is not authored facing +Z.
