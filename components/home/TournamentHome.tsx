"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bomb,
  Check,
  Crosshair,
  Flame,
  GitBranch,
  Shield,
  Swords,
  Target,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import BombsiteDiagram from "./BombsiteDiagram";
import "./tournament-home.css";

// The homepage.
//
// It explains the tournament system to somebody who has not used it, and then
// puts them into it. That second half is the part a marketing page usually
// skips: every module here ends in a real link — register for the open event,
// watch the live one, read the rules that actually apply — rather than in a
// slogan. The numbers are real too, which is why they arrive as props from a
// server component instead of being written into the file.

export type HomeStats = {
  tournamentsPlayed: number;
  matchesPlayed: number;
  playersPlayed: number;
};

export type HomeTournament = {
  slug: string;
  name: string;
  state: string;
  startsAt: string | null;
  teamCount: number;
  maxTeams: number;
  teamSize: number;
  /** Registration is open and not full. */
  canRegister: boolean;
};

/** The seven tournament roles, from R5eGames.Tournament.Core/Roles/RoleKit.cs. */
type Role = {
  id: string;
  side: "ct" | "t";
  icon: React.ReactNode;
  unique: boolean;
};

const ROLES: Role[] = [
  { id: "roamer", side: "ct", icon: <Crosshair size={16} />, unique: false },
  { id: "frontrunner", side: "ct", icon: <Swords size={16} />, unique: true },
  { id: "awper", side: "ct", icon: <Target size={16} />, unique: true },
  { id: "backup", side: "ct", icon: <Shield size={16} />, unique: false },
  { id: "planter", side: "t", icon: <Bomb size={16} />, unique: true },
  { id: "sniper", side: "t", icon: <Target size={16} />, unique: true },
  { id: "rifler", side: "t", icon: <Flame size={16} />, unique: false },
];

const FLOW_STEPS = ["ready", "veto", "warmup", "live", "result"] as const;
const FORMATS = ["single", "double", "group", "swiss"] as const;

export default function TournamentHome({
  stats,
  featured,
}: {
  stats: HomeStats;
  /** The event to point people at, or null when there is not one. */
  featured: HomeTournament | null;
}) {
  const { t } = useI18n();

  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role>(ROLES[0]);
  const [format, setFormat] = useState<(typeof FORMATS)[number]>("single");

  return (
    <div className="th">
      {/* ------------------------------------------------------------- hero */}
      <header className="th-hero">
        <div className="th-hero-copy">
          <span className="th-kicker">{t("home.kicker")}</span>
          <h1 className="th-title">
            {t("home.title1")}
            <br />
            <em>{t("home.title2")}</em>
          </h1>
          <p className="th-lead">{t("home.lead")}</p>

          {/* The point of the page. A visitor who is convinced should not then
              have to go and find the tournament in a nav menu. */}
          <div className="th-cta">
            {featured ? (
              <>
                <Link
                  className="th-btn primary"
                  href={
                    featured.canRegister
                      ? `/tournaments/${featured.slug}/register`
                      : `/tournaments/${featured.slug}`
                  }
                >
                  {featured.canRegister ? t("home.ctaRegister") : t("home.ctaWatch")}
                  <ArrowRight size={16} />
                </Link>
                <Link className="th-btn" href="/tournaments">
                  {t("home.ctaAll")}
                </Link>
              </>
            ) : (
              <Link className="th-btn primary" href="/tournaments">
                {t("home.ctaAll")}
                <ArrowRight size={16} />
              </Link>
            )}
          </div>

          {featured && (
            <p className="th-featured">
              <span className="th-featured-dot" aria-hidden />
              <strong>{featured.name}</strong>
              <span>
                {featured.teamSize}v{featured.teamSize} · {featured.teamCount}/{featured.maxTeams}{" "}
                {t("tournaments.teams").toLowerCase()}
              </span>
            </p>
          )}
        </div>

        {/* Counts, not a season number.
            The old version showed "SEASON 01", which does not exist here — the
            ladder has seasons and tournaments do not, so it named a concept the
            system has no idea about. What it can honestly say is how much has
            actually been played. */}
        <dl className="th-counts">
          <div>
            <dt>{t("home.count.tournaments")}</dt>
            <dd>{stats.tournamentsPlayed}</dd>
          </div>
          <div>
            <dt>{t("home.count.matches")}</dt>
            <dd>{stats.matchesPlayed}</dd>
          </div>
          <div>
            <dt>{t("home.count.players")}</dt>
            <dd>{stats.playersPlayed}</dd>
          </div>
        </dl>
      </header>

      {/* ---------------------------------------------------- 01 · the veto */}
      <section className="th-module">
        <div className="th-copy">
          <span className="th-num">{t("home.veto.num")}</span>
          <h2>{t("home.veto.title")}</h2>
          <p>{t("home.veto.body")}</p>

          <ul className="th-points">
            <li>
              <X size={14} /> {t("home.veto.p1")}
            </li>
            <li>
              <Check size={14} /> {t("home.veto.p2")}
            </li>
            <li>
              <Check size={14} /> {t("home.veto.p3")}
            </li>
          </ul>
        </div>

        <figure className="th-figure">
          <figcaption className="th-figcap">
            <span>{t("home.map.caption")}</span>
            <span className="th-legend">
              <i className="th-key t" /> {t("home.map.attack")}
              <i className="th-key ct" /> {t("home.map.defend")}
            </span>
          </figcaption>

          <BombsiteDiagram />

          <p className="th-fignote">{t("home.map.note")}</p>
        </figure>
      </section>

      {/* --------------------------------------------------- 02 · the roles */}
      <section className="th-module reverse">
        <div className="th-copy">
          <span className="th-num">{t("home.roles.num")}</span>
          <h2>{t("home.roles.title")}</h2>
          <p>{t("home.roles.body")}</p>
          <p className="th-small">{t("home.roles.note")}</p>
        </div>

        <div className="th-roles">
          <div className="th-role-tabs" role="tablist" aria-label={t("home.roles.title")}>
            {(["ct", "t"] as const).map((side) => (
              <div key={side} className="th-role-side">
                <span className={`th-side-label ${side}`}>
                  {side === "ct" ? t("home.roles.ct") : t("home.roles.t")}
                </span>

                {ROLES.filter((r) => r.side === side).map((r) => (
                  <button
                    key={r.id}
                    role="tab"
                    aria-selected={role.id === r.id}
                    className={`th-role ${role.id === r.id ? "on" : ""} ${side}`}
                    onClick={() => setRole(r)}
                  >
                    {r.icon}
                    <span>{t(`role.${r.id}.name`)}</span>
                    {/* One per team, and saying so is the whole reason the
                        badge exists — it is the constraint people get wrong. */}
                    {r.unique && <em>{t("home.roles.one")}</em>}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className={`th-role-detail ${role.side}`}>
            <h3>{t(`role.${role.id}.name`)}</h3>
            <p>{t(`role.${role.id}.desc`)}</p>

            <dl className="th-role-facts">
              <div>
                <dt>{t("home.roles.gun")}</dt>
                <dd>{t(`role.${role.id}.gun`)}</dd>
              </div>
              <div>
                <dt>{t("home.roles.util")}</dt>
                <dd>{t(`role.${role.id}.util`)}</dd>
              </div>
              <div>
                <dt>{t("home.roles.spawn")}</dt>
                <dd>{t(`role.${role.id}.spawn`)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- 03 · the flow */}
      <section className="th-module">
        <div className="th-copy">
          <span className="th-num">{t("home.flow.num")}</span>
          <h2>{t("home.flow.title")}</h2>
          <p>{t("home.flow.body")}</p>
        </div>

        <ol className="th-steps">
          {FLOW_STEPS.map((id, i) => (
            <li key={id}>
              <button
                className={step === i ? "on" : step > i ? "done" : ""}
                onClick={() => setStep(i)}
                aria-expanded={step === i}
              >
                <span className="th-step-n">
                  {step > i ? <Check size={14} /> : String(i + 1).padStart(2, "0")}
                </span>
                <span className="th-step-text">
                  <b>{t(`home.flow.${id}.name`)}</b>
                  <small>{t(`home.flow.${id}.desc`)}</small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {/* -------------------------------------------------- 04 · the format */}
      <section className="th-module reverse">
        <div className="th-copy">
          <span className="th-num">{t("home.format.num")}</span>
          <h2>{t("home.format.title")}</h2>
          <p>{t("home.format.body")}</p>

          <div className="th-format-tabs">
            {FORMATS.map((f) => (
              <button key={f} className={format === f ? "on" : ""} onClick={() => setFormat(f)}>
                {t(`home.format.${f}.name`)}
              </button>
            ))}
          </div>
        </div>

        <div className="th-format">
          <div className="th-format-head">
            <GitBranch size={16} />
            <strong>{t(`home.format.${format}.name`)}</strong>
          </div>
          <p>{t(`home.format.${format}.desc`)}</p>

          <ul className="th-points">
            <li>
              <Check size={14} /> {t(`home.format.${format}.p1`)}
            </li>
            <li>
              <Check size={14} /> {t(`home.format.${format}.p2`)}
            </li>
          </ul>

          <Link className="th-btn small" href="/tournaments">
            {t("home.format.cta")}
            <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------------ close */}
      <footer className="th-close">
        <Trophy size={22} />
        <div>
          <strong>{t("home.close.title")}</strong>
          <span>{t("home.close.body")}</span>
        </div>
        <Link className="th-btn primary" href={featured ? `/tournaments/${featured.slug}` : "/tournaments"}>
          <Users size={16} />
          {featured?.canRegister ? t("home.ctaRegister") : t("home.ctaAll")}
        </Link>
      </footer>
    </div>
  );
}
