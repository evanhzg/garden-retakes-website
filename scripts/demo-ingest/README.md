# Demo ingest (local)

Parses CS2 demos on **this machine** and commits only small aggregate artefacts.
Nothing about this runs on the web host — which matters, because the dev box has
911 MB of RAM and a Next.js build already took it down once. Demo parsing is
heavier than that build.

## What it produces

| File | What it is | Size |
|---|---|---|
| `data/benchmarks/faceit.json` | Percentile ladder per metric per skill band | tens of KB |
| `data/benchmarks/nades.json` | Grenade landing clusters per map | tens of KB |

Demos are cached in `.demo-cache/` and are gitignored. The website reads the two
JSON files and never sees a `.dem`.

## Setup

```bash
# server-side key from https://developers.faceit.com  (the client key 401s)
echo 'FACEIT_API_KEY=xxxxx' >> .env
```

## Run

```bash
# a player's recent FACEIT matches
node scripts/demo-ingest/ingest.mjs --player <nickname> --matches 20

# demos you already have on disk, tagged with a band
node scripts/demo-ingest/ingest.mjs --local ./demos --band 7-8

# require more samples before a band is published
node scripts/demo-ingest/ingest.mjs --player <nickname> --min-samples 50
```

Runs accumulate: `faceit.json` keeps `rawSamples` (about 20 numbers per
player-match), so later runs rebuild the ladders without re-parsing demos.

## How the comparison works

`lib/leetify.ts` computes the same metric shape from `PlayerRoundRecord` that
`benchmark.mjs` computes from demo events. Because both sides speak one
language, a Garden round and a FACEIT round are directly comparable — that is
what lets `/insights` say "68th percentile for ADR against FACEIT 7-8".

## Utility clustering

`parseGrenades` gives the resting position of every grenade. Landings are
bucketed on a 96-unit grid per map and type. A throw landing in a dense cell is
one many players also make; an empty cell is either creative or wrong, and the
count is what distinguishes them. This is the corpus the Practice mode's
utility scoring will read.

## Limits worth knowing

- FACEIT publishes demos on a delay; very recent matches often have none yet.
- `matchAverageElo` costs one API call per player per match, so a 20-match run
  is ~200 calls. The client serialises requests with a small floor delay.
- Pro demos are not fetched automatically. HLTV forbids scraping, so the `pro`
  band is meant to be filled with `--local` from demos you already hold.
