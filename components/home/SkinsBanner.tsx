"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from '@/components/I18nProvider';
import { SIGNATURE_SLOTS, rarityRank } from "@/lib/inventory";

// Homepage advert for the inventory simulator at /inventory.
//
// The simulator is the one feature here that is hard to describe and easy to
// show, so the banner leads with the goods: a slow rail of real CS2 skins,
// pulled from the same catalog the builder itself uses. Nothing is hardcoded or
// mocked — if the catalog is unreachable the banner renders nothing at all
// rather than a row of broken frames advertising a broken page.

type Skin = {
  id: number;
  def: number;
  paint: number;
  name: string;
  image: string;
  rarity: string;
  collection: string;
};

/**
 * Which weapons to show off.
 *
 * Derived from SIGNATURE_SLOTS rather than a fresh list of magic def numbers,
 * so the banner keeps advertising whatever the loadout board considers a
 * signature gun — if that set changes, this follows it for free. The two sides
 * overlap (AWP, Deagle), hence the dedupe.
 */
const SHOWCASE_DEFS = Array.from(
  new Set([...SIGNATURE_SLOTS.t, ...SIGNATURE_SLOTS.ct].map((slot) => slot.def))
);

/** Skins kept per weapon. Enough to fill the rail, few enough to stay curated. */
const PER_WEAPON = 3;

/** Seconds one full copy of the rail takes to pass, per skin on it. */
const SECONDS_PER_SKIN = 5;

export default function SkinsBanner() {
    const { t } = useI18n();

  const [skins, setSkins] = useState<Skin[]>([]);
  const [drifting, setDrifting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // One request per weapon: /api/skins only answers for a single def, and
      // it is cached for a day server-side, so the fan-out costs a handful of
      // conditional GETs rather than real work. Each request fails on its own —
      // one weapon 404ing should cost us three images, not the whole banner.
      const batches = await Promise.all(
        SHOWCASE_DEFS.map((def) =>
          fetch(`/api/skins?weapon=${def}`)
            .then((res) => (res.ok ? (res.json() as Promise<Skin[]>) : []))
            .catch(() => [] as Skin[])
        )
      );
      if (cancelled) return;

      // Rarity descending: a rail of Consumer-grade spray jobs undersells the
      // builder. Name is the tiebreaker purely so the selection is stable
      // between renders — a shuffling banner would look broken, not lively.
      const picked = batches.flatMap((batch) =>
        (Array.isArray(batch) ? batch : [])
          .filter((skin) => Boolean(skin?.image))
          .sort(
            (a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || a.name.localeCompare(b.name)
          )
          .slice(0, PER_WEAPON)
      );
      setSkins(picked);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // The site lets a visitor overrule the OS in either direction (see
    // MotionToggle), so the attribute wins where it is set and the media query
    // decides otherwise. Deciding here rather than in CSS alone means the
    // static version also skips the duplicated half of the rail, so a visitor
    // who asked for no motion does not pay for images that only exist to hide
    // the loop seam.
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      const pref = document.documentElement.dataset.motion;
      setDrifting(pref === "full" ? true : pref === "off" ? false : !reduced.matches);
    };

    sync();
    reduced.addEventListener("change", sync);
    // MotionToggle fires this after writing the attribute, so the rail stops or
    // starts on the same click rather than on the next reload.
    window.addEventListener("garden:motion", sync);
    return () => {
      reduced.removeEventListener("change", sync);
      window.removeEventListener("garden:motion", sync);
    };
  }, []);

  // Also covers the first paint, before the catalog answers: the banner appears
  // when it has something to say instead of reserving an empty band.
  if (skins.length === 0) return null;

  // Doubled so the -50% keyframe lands exactly where the first copy ended and
  // the loop has no visible seam. Pointless when nothing moves.
  const rail = drifting ? [...skins, ...skins] : skins;

  return (
    <section className="skinsb full-bleed" aria-labelledby="skinsb-title">
      <div className="skinsb-copy full-bleed-inset">
        <div className="skinsb-text">
          <h2 className="skinsb-title" id="skinsb-title">
            {t("auto.skinsbanner.your_loadout_before_you_ever_o")}
                                </h2>
          <p className="skinsb-sub">
            {t("auto.skinsbanner.build_a_full_t_and_ct_loadout")}
                                </p>
        </div>
        <Link className="skinsb-cta" href="/inventory">
          {t("auto.skinsbanner.open_the_loadout_builder")}
                          </Link>
      </div>

      {/* Decorative: the heading and the link already say everything the rail
          says, and announcing eighteen weapon names — twice, thanks to the
          duplicated half — would be noise in a screen reader. */}
      <div className="skinsb-rail" aria-hidden="true">
        <div
          className={`skinsb-track${drifting ? " skinsb-drifting" : ""}`}
          style={{ ["--skinsb-duration" as string]: `${skins.length * SECONDS_PER_SKIN}s` }}
        >
          {rail.map((skin, i) => (
            <figure className="skinsb-item" key={`${skin.id}-${i}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="skinsb-img" src={skin.image} alt="" loading="lazy" />
              <figcaption className="skinsb-name">{skin.name}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
