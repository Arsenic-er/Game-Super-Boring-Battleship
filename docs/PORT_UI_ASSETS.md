# Sunny-port UI assets — 0.7.7

## Runtime harbor

`port-harbor.png` is an original AI-generated empty-harbor backdrop, generated in
the project conversation for the user's selected sunny-port concept on 2026-09-14
(Asia/Shanghai). It contains no ship or UI. The interactive ship is rendered live
by the game; the backdrop is not represented as playable terrain or a 3D scene.
No third-party photograph, game screenshot or paid texture was imported.

Generation result: `exec-303aa2e3-3110-4a37-a45c-f35d734c1bcb.png`.
Approved direction: `exec-8b000980-3d5d-44d1-902b-ceed12210091.png`.
The approved concept contains an illustrative ship; runtime uses actual game
geometry and the player's ordered loadout. The illustrative ship is not shipped
as a substitute for the interactive model.

## Ship thumbnails

`ships/*.png` contains fifteen transparent side views rendered from this game's
existing historical hulls and real equipment adapters, not unrelated stock art.
Generation command from the canonical game worktree:

```
node scripts/inspect-historical-models.mjs --kind ships --views side --background transparent --port 5198 --out .qa/port-077/thumbnails
```

The renderer uses the existing game lighting and model provenance. Re-render after
changing a hull; do not manually paint a different weapon onto its thumbnail.
Runtime copies live under `public/assets/ui/` and are unpacked externally in the
Windows `resources/app.asar.unpacked/dist/assets/ui/` directory.

UI icons use the project's existing Font Awesome package; UI text keeps the
existing Fusion bold pixel font and localization pipeline. Their upstream notices
and existing license files remain unchanged.
