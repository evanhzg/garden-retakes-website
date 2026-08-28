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
  /** Carries the bomb, so its spawn IS the plant spot — hence a C4. */
  planter: (
    <>
      {/* The body of the charge, with its keypad and the aerial. Read at 15px
          the silhouette is what carries it: a squat box with a stub on top is
          a bomb, where the old circle-and-handle was a generic satchel. */}
      <rect x="4" y="9" width="16" height="11" rx="1" />
      <path d="M12 9V6" />
      <path d="M9.5 6h5" />
      <path d="M7.5 13h4" />
      <path d="M7.5 16.5h9" />
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

  /**
   * First through the door.
   *
   * A doorway with somebody stepping out of it. Two stacked chevrons said
   * "forward" and could equally have meant fast-forward, skip, or next — this
   * says entry, which is the actual job.
   */
  frontrunner: (
    <>
      {/* The frame, open on the right. */}
      <path d="M3 3v18h6" />
      <path d="M3 3h6" />
      {/* Through it, and out. */}
      <circle cx="14.5" cy="7" r="2" />
      <path d="M14.5 9.5v5" />
      <path d="M12 12h5" />
      <path d="M13 20l1.5-5.5L17 20" />
    </>
  ),

  /**
   * Second wave — the one behind, covering.
   *
   * Two figures, the second half a step back. A shield with a tick was the
   * universal "verified" mark and said nothing about the role; this says there
   * are two of you and one is behind, which is the whole job.
   */
  backup: (
    <>
      {/* In front. */}
      <circle cx="9" cy="6.5" r="2.5" />
      <path d="M4.5 20v-3a4.5 4.5 0 0 1 9 0v3" />
      {/* Behind, and offset. */}
      <circle cx="17" cy="9" r="2" />
      <path d="M13.5 20v-2.2a3.5 3.5 0 0 1 7 0V20" />
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
