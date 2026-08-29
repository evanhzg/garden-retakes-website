"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import "./teams.css";

type StandingTeam = {
  id: number;
  name: string;
  slug: string;
  tag: string | null;
  members: { steamId: string; name: string }[];
};

/**
 * Entering a tournament as a standing team.
 *
 * The roster has no cap and the tournament has a size, so the second half of
 * this is always "which of you is playing" — that is the whole reason it is a
 * picker rather than a button. A team of twelve entering a 3v3 chooses three,
 * and the three who play are the three whose stats the tournament records.
 *
 * The refusal that matters comes from the server: a player already in this
 * tournament with another of their teams. It is checked there because it is a
 * fact about the tournament rather than about this team, and this component
 * cannot see the other entries.
 */
export default function EnterWithTeam({
  tournamentId,
  teamSize,
  teams,
}: {
  tournamentId: number;
  teamSize: number;
  teams: StandingTeam[];
}) {
  const { t } = useI18n();
  const router = useRouter();

  const [teamId, setTeamId] = useState<number | null>(teams[0]?.id ?? null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (teams.length === 0) return null;

  const team = teams.find((x) => x.id === teamId) ?? teams[0];

  const toggle = (steamId: string) => {
    setError(null);
    setPicked((prev) =>
      prev.includes(steamId)
        ? prev.filter((x) => x !== steamId)
        : // Silently ignoring a click past the limit reads as a broken
          // checkbox; the button below says how many are needed, and the count
          // in the header moves, so the limit explains itself.
          prev.length >= teamSize
          ? prev
          : [...prev, steamId],
    );
  };

  return (
    <section className="panel tm-enter">
      <div className="admin-head">
        <h2>
          <Users size={16} aria-hidden /> {t("teams.enterTitle")}
        </h2>
      </div>

      <p className="muted tm-hint">{t("teams.enterWhy", { n: String(teamSize) })}</p>

      {teams.length > 1 && (
        <label className="tm-field-wide">
          <span>{t("teams.whichTeam")}</span>
          <select
            value={team.id}
            onChange={(e) => {
              setTeamId(Number(e.target.value));
              setPicked([]);
              setError(null);
            }}
          >
            {teams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.tag ? `[${x.tag}] ${x.name}` : x.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="tm-sub">
        {t("teams.pickPlayers", { picked: String(picked.length), n: String(teamSize) })}
      </div>

      <ul className="tm-pick">
        {team.members.map((m) => {
          const on = picked.includes(m.steamId);
          const full = picked.length >= teamSize && !on;

          return (
            <li key={m.steamId}>
              <button
                type="button"
                className={`tm-pick-row ${on ? "on" : ""}`}
                aria-pressed={on}
                disabled={busy || full}
                onClick={() => toggle(m.steamId)}
              >
                <span className="tm-member-name">{m.name}</span>
                <span className="tm-pick-mark">{on ? "✓" : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="tm-actions">
        <button
          className="btn btn-primary"
          disabled={busy || picked.length !== teamSize}
          onClick={async () => {
            setBusy(true);
            setError(null);

            try {
              const res = await fetch("/api/teams", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  action: "enter",
                  teamId: team.id,
                  tournamentId,
                  players: picked,
                }),
              });

              const data = await res.json();
              if (!res.ok || data.error) {
                setError(String(data.error ?? "That did not work."));
                return;
              }

              router.refresh();
            } catch (err) {
              setError(String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("teams.enterCta")}
        </button>

        {picked.length !== teamSize && (
          <span className="muted tm-hint">
            {t("teams.pickMore", { n: String(teamSize - picked.length) })}
          </span>
        )}
      </div>

      {error && <p className="tm-error">{error}</p>}
    </section>
  );
}
