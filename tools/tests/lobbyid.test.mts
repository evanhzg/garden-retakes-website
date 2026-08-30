/**
 * Lobby ids.
 *
 * Short because they go in a URL somebody pastes into Discord, and a 36-char
 * UUID is unreadable there. Short enough to collide is the failure this guards:
 * an id that repeats puts two parties in one lobby.
 */
import { isLobbyId, newLobbyId } from "@/lib/lobbyId";

let fails = 0;
const check = (n: string, c: boolean, extra = "") => {
  console.log((c ? "ok   " : "FAIL ") + n + (c ? "" : "  " + extra));
  if (!c) fails++;
};

const one = newLobbyId();

check("an id is eight characters", one.length === 8, one);
check("an id is its own shape", isLobbyId(one), one);
check("a UUID is not one", !isLobbyId("49c27983-ee07-4288-bc44-774864ff85c0"));
check("the empty string is not one", !isLobbyId(""));
check("a short string is not one", !isLobbyId("ABC"));

// The letters that are read wrong out loud, since the whole point is a code
// somebody can type from a screenshot.
check("no I, L, O or U anywhere", !/[ILOU]/.test(Array.from({ length: 200 }, newLobbyId).join("")));

// Not proof of uniformity, but it catches the two ways this actually breaks:
// a generator stuck on one value, and one whose alphabet is narrower than it
// looks.
{
  const many = new Set(Array.from({ length: 5000 }, newLobbyId));
  check("five thousand ids are five thousand ids", many.size === 5000, String(many.size));
}

{
  const seen = new Set(Array.from({ length: 4000 }, newLobbyId).join(""));
  check("every symbol in the alphabet appears", seen.size === 32, String(seen.size));
}

console.log(fails ? `\n${fails} FAILED` : "\nall good");
process.exit(fails ? 1 : 0);
