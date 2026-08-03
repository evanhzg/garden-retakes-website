"use client";

import { useEffect, useState } from "react";
import { useI18n } from '@/components/I18nProvider';
import AvatarImage from "@/components/AvatarImage";

// The season-end vote, beside the hero.
//
// Five questions, one answer each, ten candidates. While it is open nobody sees
// the running totals — a visible tally turns a vote into a bandwagon — so the
// panel shows what you picked and how long is left. Once it closes the same
// panel becomes the results.
//
// Renders nothing when there is no poll: the homepage should not carry an empty
// box for eleven months of the year.

type Candidate = { steamId: string; name: string; avatar?: string; rank: number };
type Category = { id: number; slug: string; name: string; description: string };
type Result = { category: string; name: string; total: number; results: { steamId: string; name: string; avatar?: string; count: number }[] };

type Payload = {
  poll: { id: number; seasonId: number; opensAt: string; closesAt: string; open: boolean } | null;
  categories?: Category[];
  candidates?: Candidate[];
  mine?: Record<string, string>;
  results?: Result[] | null;
  signedIn?: boolean;
};

function useCountdown(iso: string | undefined) {
  const [left, setLeft] = useState<string>("");
  useEffect(() => {
    if (!iso) return;
    const tick = () => {
      const ms = new Date(iso).getTime() - Date.now();
      if (ms <= 0) return setLeft("closed");
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setLeft(h >= 1 ? `${h}h ${m}m left` : `${m}m left`);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [iso]);
  return left;
}

export default function SeasonVote() {
    const { t } = useI18n();

  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCat, setOpenCat] = useState<string | null>(null);

  const load = () =>
    fetch("/api/vote", { cache: "no-store" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ poll: null }));

  useEffect(() => {
    load();
  }, []);

  const left = useCountdown(data?.poll?.closesAt);

  if (!data?.poll) return null;

  const cast = async (category: string, target: string) => {
    setBusy(category);
    setError(null);
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, target }),
      });
      const json = await res.json();
      if (!res.ok) setError(json.error ?? "Could not save your vote.");
      else {
        setOpenCat(null);
        await load();
      }
    } catch {
      setError("Network error.");
    } finally {
      setBusy(null);
    }
  };

  // ---- closed: results ----
  if (!data.poll.open) {
    return (
      <aside className="vote-panel">
        <header className="vote-head">
          <span className="kicker">{t("auto.seasonvote.season")} {data.poll.seasonId}</span>
          <h3>{t("auto.seasonvote.the_votes_are_in")}</h3>
        </header>
        <ul className="vote-results">
          {(data.results ?? []).map((r) => {
            const win = r.results[0];
            return (
              <li key={r.category}>
                <span className="vote-res-cat">{r.name}</span>
                {win ? (
                  <span className="vote-res-win">
                    <AvatarImage steamId={win.steamId} src={win.avatar} alt={win.name} className="avatar avatar-sm" />
                    <strong>{win.name}</strong>
                    <span className="num">{win.count}</span>
                  </span>
                ) : (
                  <span className="muted">{t("auto.seasonvote.no_votes")}</span>
                )}
              </li>
            );
          })}
        </ul>
      </aside>
    );
  }

  // ---- open: ballot ----
  const mine = data.mine ?? {};
  const done = (data.categories ?? []).filter((c) => mine[c.slug]).length;

  return (
    <aside className="vote-panel">
      <header className="vote-head">
        <span className="kicker">{t("auto.seasonvote.season")} {data.poll.seasonId} {t("auto.seasonvote.awards")}</span>
        <h3>{t("auto.seasonvote.vote")}</h3>
        <span className="vote-left num">{left}</span>
      </header>

      {/* The freeze is the part of "the season is over" that players actually
          feel: they queue for ranked, get classic, and assume something broke.
          It belongs above the sign-in branch so a signed-out visitor reads it
          too — the answer to "where did ranked go" should not require an
          account. */}
      <p className="vote-frozen">{t("home.seasonVote.frozen")}</p>

      {!data.signedIn ? (
        <p className="vote-signin">
          <a className="btn btn-primary" href="/api/auth/steam/login">{t("auto.seasonvote.sign_in_with_steam_to_vote")}</a>
        </p>
      ) : (
        <>
          <p className="vote-progress num">{done}/{(data.categories ?? []).length} {t("auto.seasonvote.cast")}</p>
          <ul className="vote-cats">
            {(data.categories ?? []).map((c) => {
              const chosen = mine[c.slug];
              const chosenName = data.candidates?.find((x) => x.steamId === chosen)?.name;
              const expanded = openCat === c.slug;
              return (
                <li key={c.slug} className={expanded ? "open" : ""}>
                  <button className="vote-cat" onClick={() => setOpenCat(expanded ? null : c.slug)} aria-expanded={expanded}>
                    <span className="vote-cat-name">{c.name}</span>
                    <span className="vote-cat-pick">{chosenName ?? "pick one"}</span>
                  </button>

                  {expanded && (
                    <>
                      <p className="vote-cat-desc">{c.description}</p>
                      <div className="vote-choices">
                        {(data.candidates ?? []).map((cand) => (
                          <button
                            key={cand.steamId}
                            className={`vote-choice ${chosen === cand.steamId ? "on" : ""}`}
                            disabled={busy === c.slug}
                            onClick={() => cast(c.slug, cand.steamId)}
                          >
                            <AvatarImage steamId={cand.steamId} src={cand.avatar} alt={cand.name} className="avatar avatar-sm" />
                            <span>{cand.name}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="vote-note">{t("auto.seasonvote.one_vote_per_category_you_can")}</p>
        </>
      )}

      <div aria-live="assertive">{error && <p className="skin-note skin-note-error"><span>{error}</span></p>}</div>
    </aside>
  );
}
