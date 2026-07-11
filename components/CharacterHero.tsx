"use client";

/**
 * Renders the full-width character image hero (ps-stage) for a given Steam ID.
 * Falls back to /default_character.PNG if no per-player image exists.
 */
export default function CharacterHero({ steamId }: { steamId: string }) {
  return (
    <section className="profile-showcase">
      <div className="ps-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="ps-bg"
          src={`/${steamId}_character.PNG`}
          alt=""
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = "/default_character.PNG";
          }}
        />
        <div className="ps-scrim" aria-hidden="true" />
      </div>
    </section>
  );
}
