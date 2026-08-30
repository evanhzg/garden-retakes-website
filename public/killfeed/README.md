# Killfeed weapon icons

Drop CS2's killfeed icons here as `<weapon>.svg` and the match feed uses them
instead of the drawn fallbacks in `components/tournament/WeaponIcon.tsx`.

The filename is the engine's weapon name, without the `weapon_` prefix and
lowercased — exactly what the plugin reports and what the feed stores:

    ak47.svg   m4a1_silencer.svg   awp.svg      deagle.svg
    hegrenade.svg   flashbang.svg   smokegrenade.svg
    knife.svg   planted_c4.svg   ...

Anything with no file here falls back to the drawn silhouette, so a partial set
works: add the ten weapons that actually turn up in your matches and leave the
rest. Nothing breaks and nothing looks half-finished — an unmatched name simply
draws the shape it already drew.

Size: they are rendered at 40×13 with `object-fit: contain`, so any aspect ratio
works as long as the weapon points LEFT, which is how the feed reads.

## Why they are not committed

They are Valve's art. Extracting them from a game install and committing them to
this repo is a decision about somebody else's copyright, and not one a deploy
should make on your behalf — so the loader is here and the assets are yours to
add.
