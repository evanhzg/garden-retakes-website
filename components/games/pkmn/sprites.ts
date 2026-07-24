// Pokémon Showdown sprite/cry CDN helpers (free hotlink host used by Showdown
// itself). Gen-5 animated sprites give the classic handheld feel.

export const speciesId = (species: string) =>
  species.toLowerCase().replace(/[^a-z0-9]/g, "");

export const frontSprite = (species: string) =>
  `https://play.pokemonshowdown.com/sprites/ani/${speciesId(species)}.gif`;

export const backSprite = (species: string) =>
  `https://play.pokemonshowdown.com/sprites/ani-back/${speciesId(species)}.gif`;

export const staticSprite = (species: string) =>
  `https://play.pokemonshowdown.com/sprites/gen5/${speciesId(species)}.png`;

export const cryUrl = (species: string) =>
  `https://play.pokemonshowdown.com/audio/cries/${speciesId(species)}.mp3`;

export function playCry(species: string, volume = 0.35) {
  try {
    const a = new Audio(cryUrl(species));
    a.volume = volume;
    a.play().catch(() => {});
  } catch {
    /* no audio available */
  }
}
