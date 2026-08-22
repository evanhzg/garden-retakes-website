# Map screenshots

Regenerates `public/maps/*.webp` — the pictures shown wherever the site previews
a map: the map-preference tab, the veto board, a match's result banner.

## Why this exists

`public/maps/*.png` used to be byte-identical copies of `public/radars/*.png`. So
every "map preview" on the site was a radar: a top-down diagram, at 1024×1024,
of a map the viewer is being asked to recognise. A radar is the right picture for
a heatmap or a nade lineup and the wrong one for "do you want to play this map".

CS2 ships the real thing — the establishing shot its own map picker uses — at
`panorama/images/map_icons/screenshots/1080p/<map>_png.vtex_c` inside
`game/csgo/pak01_dir.vpk`. That is a Source 2 compiled texture (DXT5), not a PNG,
so it needs decoding rather than copying.

The two folders now mean different things and should stay that way:

| | |
|---|---|
| `public/maps/*.webp` | Photographs of the map. Previews, veto, match banners. |
| `public/radars/*.png` | Top-down diagrams. Heatmaps (`app/stats/heatmaps`), nade lineups (`lib/utilityShared.ts`), `Utility3D`. |

## Running it

Needs CS2 installed locally and the .NET SDK.

```bash
cd tools/map-screenshots
dotnet run -c Release -- \
  "$HOME/Steam/steamapps/common/Counter-Strike Global Offensive/game/csgo/pak01_dir.vpk" \
  ../../public/maps
```

Both arguments are optional; the defaults are that VPK path and `./out`.

Output is 1280×720 WebP at quality 82 — around 100 KiB a map, against three
megabytes for the source PNG, and still sharp as a full-width banner. The map
list is at the top of `Program.cs`; it is the same ten maps as `MAP_POOLS.retakes`
in `scripts/retakesMatchmaking.js`, and adding a map means adding it in both.

`scripts/ws-ingest/vpk.js` is a lighter reader for *listing* what a VPK contains
without decoding anything — useful for finding the path of a new asset before
adding it here.
