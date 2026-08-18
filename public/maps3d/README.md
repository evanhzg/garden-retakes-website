# Map collision meshes

`<map>.mesh` files, produced by `tools/convert-map-mesh.mjs` and decoded by
`lib/utility3d.ts`. The 3D tab on `/utility` loads one per map; a map with no
file here falls back to its radar image laid flat, which is why an empty
directory is a working state rather than a broken one.

To add a map:

1. Source 2 Viewer against your CS2 install, open `maps/<map>.vpk`, find
   `world_physics.vmdl_c` and export it as OBJ.
2. `node tools/convert-map-mesh.mjs de_mirage ~/exports/de_mirage/world_physics.obj`

The converter also reads `.tri` files from the physics extractors, welds
duplicated corners and drops degenerate triangles, and tells you the map's span
so you can see at a glance whether you exported the map or a single prop.

Once a map has a mesh, the 3D tab also gets physics: grenade simulation with
real bounces, and smoke and molotov volumes flooded against this geometry. Score
the simulator against arcs people actually threw with:

    node tools/fit-grenade-constants.mjs de_mirage
    node tools/fit-grenade-constants.mjs de_mirage --sweep restitution 0.3 0.7 0.05

These are binaries of a megabyte or two each. That is fine for a handful of
maps; if the set grows past the active duty pool it is worth moving them to the
same bucket the clips use and pointing `meshUrl` at it.
