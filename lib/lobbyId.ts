/**
 * Lobby ids, short enough to say out loud.
 *
 * They were UUIDs: 36 characters of hyphenated hex in a URL somebody is
 * expected to paste into a Discord message so five friends can join. The id is
 * opaque to everything that handles it — the socket server treats it as a
 * string key and nothing parses it — so its only real requirement is that two
 * lobbies created at the same moment do not collide.
 *
 * Eight characters from a 32-symbol alphabet is 40 bits, or about a thousand
 * billion ids. Lobbies live for minutes and there are never more than a handful
 * at once, so the birthday bound is not close to interesting: even at a million
 * live lobbies the chance of any collision is under one in two thousand.
 *
 * Crockford's alphabet, minus the letters that are read wrong out loud. No I,
 * L, O or U — the first three because they are 1, 1 and 0 in most fonts, and U
 * because excluding it is what stops a random id spelling something. That is
 * the whole reason not to use plain base32 or hex here: the id is meant to
 * survive being typed from a screenshot.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const LENGTH = 8;

/**
 * Whether a string could have been produced by newLobbyId.
 *
 * A regex rather than spreading the string: this target predates ES2015
 * iteration, and `[...value]` compiles but does not type-check here.
 */
const SHAPE = new RegExp(`^[${ALPHABET}]{${LENGTH}}$`);

export const isLobbyId = (value: string): boolean => SHAPE.test(value);

/**
 * A fresh id.
 *
 * `crypto.getRandomValues` rather than Math.random: a lobby id is a capability
 * — anybody holding it can join — so a predictable sequence would let somebody
 * walk into a party they were not invited to. Rejection sampling rather than a
 * modulo, because 256 does not divide 32 evenly for an arbitrary alphabet and a
 * biased id is a smaller keyspace than it looks.
 */
export function newLobbyId(): string {
  const out: string[] = [];
  const buffer = new Uint8Array(LENGTH * 2);

  while (out.length < LENGTH) {
    crypto.getRandomValues(buffer);

    // An indexed loop rather than for-of: this target predates ES2015
    // iteration and a typed array cannot be walked with one here.
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      if (out.length >= LENGTH) break;
      // 256 is a multiple of 32, so a byte maps evenly and nothing is rejected
      // — kept as a masked read rather than a modulo so that stays true if the
      // alphabet ever changes length and the check below starts mattering.
      const index = byte % ALPHABET.length;
      if (byte - index + ALPHABET.length <= 256) out.push(ALPHABET[index]);
    }
  }

  return out.join("");
}
