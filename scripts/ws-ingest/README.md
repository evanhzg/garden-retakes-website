# ws-ingest

Pulls a CS2 Workshop skin into the two things Garden needs from it:

- a **preview image** for the web inventory (`public/web_assets/<id>.png`)
- the compiled **`.vmat_c` material path(s)** inside the VPK, for the `!ws` plugin

```bash
node scripts/ws-ingest 3771230656
```

## What it does

| Stage | Source | Output |
|---|---|---|
| 1. Metadata | `ISteamRemoteStorage/GetPublishedFileDetails` | title, description, tags, `preview_url` |
| 2. Preview | `preview_url` | `public/web_assets/<id>.png` |
| 3. VPK | `steamcmd +workshop_download_item 730 <id>` | the downloaded `.vpk` |
| 4. Materials | the VPK directory tree | `materials/**/*.vmat_c` |
| 5. Export | all of the above | `data/workshop/<id>.json` + `index.json` |

Stages are independent — `--skip-download`, `--skip-image` and `--vpk <file>`
let you run any subset.

## Dependencies

**Required: none.** The VPK reader is native (see below) and everything else
uses Node's built-in `fetch` and `child_process`. Node 18+.

**For stage 3 you need `steamcmd`:**

```bash
# Ubuntu / Debian / WSL — steamcmd is a 32-bit binary, so it needs the 32-bit loader
sudo apt-get install -y lib32gcc-s1

# then the tarball (no root needed)
mkdir -p ~/steamcmd && cd ~/steamcmd
curl -sSL https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz | tar zxf -
./steamcmd.sh +quit          # first run self-updates, takes a minute
```

The tool finds it at `~/steamcmd/steamcmd.sh`, on `PATH`, or via `$STEAMCMD` /
`--steamcmd <path>`.

**Optional, for real PNG output:** Steam serves previews as **JPEG**. Converting
to PNG needs a decoder:

```bash
npm i -D sharp            # fastest, native
# or, pure JS:
npm i -D jpeg-js pngjs
```

Without one, the original JPEG is kept and the run tells you so. Honestly, JPEG
is the better choice here — re-encoding a lossy JPEG as PNG multiplies the file
size for no quality gain. Use `--image-format original` to skip the conversion
and keep `.jpg`.

**Not needed:** ValveResourceFormat / Source2Viewer / .NET. Listing a VPK's
contents only requires reading its directory tree, which is plain
nul-terminated strings — no Source 2 decompilation involved. You'd only need
VRF to extract the actual *texture data*, which this tool deliberately doesn't do.

## Options

```
--vpk <file>          Use a local .vpk instead of running steamcmd
--skip-download       Metadata + preview only
--skip-image          Don't download the preview
--steamcmd <path>     Path to steamcmd
--steam-dir <path>    Where steamcmd keeps steamapps/ (if non-standard)
--out-dir <path>      Preview directory     (default: public/web_assets)
--data-dir <path>     JSON directory        (default: data/workshop)
--image-format <fmt>  png | original        (default: png)
--sql                 Also emit a mock SQL insert
--json                Print the record to stdout
--quiet               Errors and summary only
```

## Output

`data/workshop/<id>.json`:

```json
{
  "workshopId": "3771230656",
  "name": "Glock-18 | Magic Touch",
  "def": 4,
  "weapon": "Glock-18",
  "primaryMaterial": "materials/models/weapons/customization/paints/custom/glock_magic_touch.vmat_c",
  "materials": ["…every .vmat_c found…"],
  "preview": { "webPath": "/web_assets/3771230656.png", "format": "png" },
  "vpk": { "file": "…", "version": 2, "entryCount": 8 }
}
```

`def` is the CS2 item definition index, resolved from the workshop tags (or the
title) against `@ianlucas/cs2-lib`. It's the key both consumers already use:
`InventoryItem.Def` in the InventorySimulator plugin, and `?weapon=<def>` on
`/api/skins`. A skin VPK usually contains the base weapon material as well as
the custom paint, so `primaryMaterial` picks the paint and `materials` keeps
everything.

`data/workshop/index.json` collects every ingested skin into one array, so the
site or the plugin can load the whole catalogue in a single read. It's rebuilt
from the per-skin files on every run.

## Tests

```bash
node scripts/ws-ingest/vpk.test.js
```

Builds VPK archives byte-by-byte to the documented layout and asserts the reader
recovers the exact paths — covering v1 and v2 headers, `" "` root directories,
extension-less files, inline preload data and malformed input. There's no CS2
VPK in the repo to test against (they're hundreds of megabytes).

## VPK format note

The reader handles VPK v1 and v2:

```
header   uint32 signature = 0x55AA1234
         uint32 version, uint32 treeSize
         [v2] uint32 fileDataSectionSize, archiveMD5SectionSize,
              otherMD5SectionSize, signatureSectionSize
tree     extension\0 path\0 filename\0
           uint32 crc, uint16 preloadBytes, uint16 archiveIndex,
           uint32 entryOffset, uint32 entryLength, uint16 0xFFFF
           <preloadBytes inline>
```

Multi-part sets (`pak01_dir.vpk` + `pak01_000.vpk`) keep the tree in the `_dir`
file; the tool picks it automatically.
