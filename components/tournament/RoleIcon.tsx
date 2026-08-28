"use client";

import { useI18n } from "@/components/I18nProvider";
import { CT_ROLES, T_ROLES, roleLabel, type RoleSide } from "@/lib/tournament/roles";
import "./roleicon.css";

// A mark for each of the seven roles.
//
// Inline SVG rather than files: these are seven small line drawings that have
// to take the surrounding text colour, sit on both themes, and appear beside a
// player's name at 14px inside a panel that is already dense. A sprite sheet or
// seven <img> requests would be more machinery and less control, and an emoji
// would render differently on every machine reading the bracket.
//
// Drawn on lucide's grid — 24x24, no fill, 2px round strokes — because the rest
// of the site's iconography is lucide and a role marker that is visibly a
// different weight reads as a different KIND of thing.
//
// The two sniper roles share a mark on purpose. They are the same job on
// opposite sides, which is the whole reason the CT one stopped being called
// AWPer, and giving them different drawings would undo that in pictures.

const P = {
  /** Carries the bomb, so its spawn is the plant spot. */
  planter: (
    <>
      <circle cx="10" cy="15" r="6" />
      <path d="M14.2 10.8 18 7" />
      <path d="M16 5h3v3" />
    </>
  ),

  /** The sniper slot, T side. */
  sniper: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),

  /** Best gun, least to throw. */
  rifler: (
    <>
      <path d="M3 12h7" />
      <path d="M12 8.5 17.5 12 12 15.5Z" />
      <path d="M20 8.5v7" />
    </>
  ),

  /** Free to leave the pack, which is what makes a roam a roam. */
  roamer: (
    <>
      <path d="M4 18c0-7 4.5-11 11-11h3" />
      <path d="M15 4l3.5 3L15 10" />
      <circle cx="4" cy="19" r="2" />
    </>
  ),

  /** First through the door. */
  frontrunner: (
    <>
      <path d="M4 4v16" />
      <path d="M9 7l5 5-5 5" />
      <path d="M15 7l5 5-5 5" />
    </>
  ),

  /** Second wave — the role that makes a three-player side work. */
  backup: (
    <>
      <path d="M12 3l8 3v6c0 4.8-3.4 8.3-8 9.4C7.4 20.3 4 16.8 4 12V6Z" />
      <path d="M9.5 12l1.8 1.9 3.4-3.6" />
    </>
  ),
} as const;

/** The CT sniper is the same job as the T one, so it is the same mark. */
const MARKS: Record<string, JSX.Element> = {
  ...P,
  awper: P.sniper,
};

export default function RoleIcon({
  role,
  size = 15,
  /** Adds a hover title. Off inside a legend, where the label is next to it. */
  labelled = true,
}: {
  role: string | null | undefined;
  size?: number;
  labelled?: boolean;
}) {
  if (!role || !MARKS[role]) {
    // An em dash rather than a gap, so "no role yet" reads as a state rather
    // than as a drawing that failed to load.
    return (
      <span className="ri ri-none" style={{ width: size, height: size }} aria-hidden>
        —
      </span>
    );
  }

  const name = roleLabel(role);

  return (
    <svg
      className="ri"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={labelled ? "img" : undefined}
      aria-label={labelled ? name : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {labelled && <title>{name}</title>}
      {MARKS[role]}
    </svg>
  );
}

/**
 * The key to the marks.
 *
 * Needed the moment the panels stopped writing role names out. Seven line
 * drawings are only readable if there is somewhere on the page that says what
 * they are, and "hover it and wait for a tooltip" is not somewhere — it does
 * not exist on a phone at all.
 */
export function RoleLegend() {
  const { t } = useI18n();

  const column = (side: RoleSide, heading: string) => (
    <div className="rl-col">
      <h4 className="rl-head">{heading}</h4>
      <ul className="rl-list">
        {(side === "T" ? T_ROLES : CT_ROLES).map((r) => (
          <li key={`${side}-${r.id}`}>
            <RoleIcon role={r.id} size={14} labelled={false} />
            <span className="rl-name">{r.label}</span>
            {r.unique && <span className="rl-uniq">{t("roledraft.unique")}</span>}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <aside className="rl" aria-label={t("roles.legend")}>
      <p className="rl-title">{t("roles.legend")}</p>
      <div className="rl-cols">
        {column("T", t("roledraft.tSide"))}
        {column("CT", t("roledraft.ctSide"))}
      </div>
    </aside>
  );
}

/** A player's two roles, as two marks. Used wherever a roster is listed. */
export function RolePair({ roleT, roleCt }: { roleT: string | null; roleCt: string | null }) {
  const { t } = useI18n();

  return (
    <span className="ri-pair">
      <span className="ri-slot" title={`${t("roledraft.tSide")}: ${roleLabel(roleT) || "—"}`}>
        <RoleIcon role={roleT} />
      </span>
      <span className="ri-slot" title={`${t("roledraft.ctSide")}: ${roleLabel(roleCt) || "—"}`}>
        <RoleIcon role={roleCt} />
      </span>
    </span>
  );
}
