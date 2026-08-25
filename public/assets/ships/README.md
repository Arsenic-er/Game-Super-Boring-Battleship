# Runtime ship assets

This directory contains only validated runtime exports. Source `.blend`/`.fbx` files and working files belong in the private asset repository.

Each imported class uses:

```text
<ship-class-id>/
  manifest.json
  lod0.glb
  lod1.glb
  lod2.glb
  LICENSE.txt
  SOURCE.md
```

Run `npm run assets:ships:validate -- public/assets/ships` before committing an imported model. Missing or invalid models must leave the procedural hull fallback active.
