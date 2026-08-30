"use client";

import { useI18n } from "@/components/I18nProvider";
import { ROLE_ICON } from "@/components/roleIcons";
import { CT_ROLES, T_ROLES, roleLabel, type RoleSide } from "@/lib/tournament/roles";
import "./roleicon.css";

// A mark for each role, wherever a role is shown.
//
// These used to be a hand-drawn set, on the argument that a dense 14px panel
// wanted its own drawings. It did not: lucide takes currentColor and holds up
// at that size perfectly well, and the real cost of a private set was that the
// match page drew a role one way while the lobby, the loadout and the homepage
// drew it another. One set, from components/roleIcons.ts, is worth more than a
// slightly more bespoke one — and it means a new role appears everywhere at
// once instead of in three places if somebody remembers all three.

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
  const Icon = role ? ROLE_ICON[role] : undefined;

  if (!Icon) {
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
    <Icon
      className="ri"
      size={size}
      role={labelled ? "img" : undefined}
      aria-label={labelled ? name : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {labelled && <title>{name}</title>}
    </Icon>
  );
}

/**
 * The key to the marks.
 *
 * Needed the moment the panels stopped writing role names out. A column of line
 * drawings is only readable if there is somewhere on the page that says what
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
