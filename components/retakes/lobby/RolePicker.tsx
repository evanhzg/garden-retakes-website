"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Ban, Mic } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { ROLE_ICON } from "@/components/retakes/roleIcons";
import { useAnchoredPosition } from "@/components/retakes/useAnchoredPosition";
import { isRoleUnique, rolesFor, type Side } from "@/lib/retakeLoadout";

/** How long a role has to be hovered before it explains itself. */
const DETAIL_DELAY = 3000;

const SIDES: Side[] = ["T", "CT"];

export type RoleState = { roleT: string; roleCt: string; isCaller: boolean };

/** `"T:sniper"` → the player already holding it. Only the unique roles clash. */
export type RoleClaims = Record<string, string[]>;

export const claimKey = (side: Side, roleId: string) => `${side}:${roleId}`;

/**
 * Your two roles, under your seat, the way a lane and a position sit under a
 * League pick.
 *
 * The lobby used to ask for this in a panel beside the party: a side tab, a row
 * of five buttons, and a checkbox — a settings form for something that is a
 * property of a player, and which every other player in the party needs to be
 * able to read at a glance. It reads much better as two small badges under the
 * face they belong to.
 *
 * Both sides at once in the bubble, in columns, because a retake gives you both
 * within the same match and picking them one tab at a time is the trip this
 * whole rebuild is removing.
 *
 * The detail card is deliberately slow. Three seconds is long enough that it
 * never fires while somebody is sweeping the list looking for the role they
 * already know they want, and short enough to be findable by anybody who
 * pauses because they do not know what a rotator does *here* — which is the
 * question it answers. Not what the role means in a normal match: what it means
 * when four people are walking onto a planted site.
 */
export default function RolePicker({
  value,
  editable,
  claims,
  callers,
  onChange,
  compact,
}: {
  value: RoleState;
  /** Only your own seat opens the bubble; everybody else's is a read-out. */
  editable: boolean;
  claims: RoleClaims;
  /** Names of everyone in the party who has claimed the caller flag. */
  callers: string[];
  onChange: (next: Partial<RoleState>) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  /** The open bubble's anchor, in state rather than read off the ref at render
      time — the ref is set long before anybody can click, but state is what
      actually drives a render. */
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const roleFor = (side: Side) => (side === "T" ? value.roleT : value.roleCt);

  const conflicted = (side: Side) => {
    const id = roleFor(side);
    if (!id || !isRoleUnique(id)) return false;
    return (claims[claimKey(side, id)]?.length ?? 0) > 1;
  };

  const openBubble = () => {
    if (!editable) return;
    setAnchor((a) => (a ? null : wrapRef.current));
  };

  return (
    <div className={`rq-roles ${compact ? "compact" : ""}`} ref={wrapRef}>
      {SIDES.map((side) => {
        const id = roleFor(side);
        const Icon = id ? ROLE_ICON[id] : null;
        const bad = conflicted(side);
        return (
          <button
            key={side}
            type="button"
            className={`rq-rolepip ${side.toLowerCase()} ${id ? "set" : ""} ${bad ? "clash" : ""}`}
            onClick={openBubble}
            disabled={!editable}
            aria-haspopup={editable ? "menu" : undefined}
            aria-expanded={editable ? Boolean(anchor) : undefined}
            title={
              id
                ? `${t(`loadout.side.${side}`)} — ${t(`role.${id}.name`)}`
                : `${t(`loadout.side.${side}`)} — ${t("lobby.role.unset")}`
            }
          >
            {Icon ? <Icon size={compact ? 13 : 15} /> : <span className="rq-rolepip-dash">–</span>}
            <span className="rq-rolepip-side">{side}</span>
          </button>
        );
      })}

      {value.isCaller && (
        <span
          className={`rq-rolepip caller ${callers.length > 1 ? "clash" : ""}`}
          title={t("loadout.role.caller")}
        >
          <Mic size={compact ? 13 : 15} />
        </span>
      )}

      {anchor && (
        <RoleBubble
          anchor={anchor}
          value={value}
          claims={claims}
          callers={callers}
          onChange={onChange}
          onClose={() => setAnchor(null)}
        />
      )}
    </div>
  );
}

/** The bubble itself: one column per side, above the pips that opened it. */
function RoleBubble({
  anchor,
  value,
  claims,
  callers,
  onChange,
  onClose,
}: {
  anchor: HTMLElement;
  value: RoleState;
  claims: RoleClaims;
  callers: string[];
  onChange: (next: Partial<RoleState>) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);
  const pos = useAnchoredPosition(anchor, ref, 12);
  const [detail, setDetail] = useState<{ side: Side; roleId: string; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [onClose]);

  /** Arm the three-second detail, remembering where the cursor was. */
  const arm = (side: Side, roleId: string, x: number, y: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDetail({ side, roleId, x, y }), DETAIL_DELAY);
  };
  const disarm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setDetail(null);
  };

  const body = (
    <div className="rq-rolebubble-scrim" onClick={onClose}>
      <motion.div
        ref={ref}
        className={`rq-rolebubble ${pos?.below ? "below" : "above"}`}
        role="menu"
        aria-label={t("lobby.role.title")}
        style={{
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          // See SideBubble: hidden until measured, never opacity-gated.
          visibility: pos ? "visible" : "hidden",
          ["--tail" as string]: pos ? `${pos.tail}px` : "50%",
        }}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.95, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 440, damping: 34 }}
      >
        <div className="rq-rolebubble-head">
          <strong>{t("lobby.role.title")}</strong>
          <span>{t("lobby.role.hint")}</span>
        </div>

        <div className="rq-rolebubble-cols">
          {SIDES.map((side) => {
            const mine = side === "T" ? value.roleT : value.roleCt;
            const field = side === "T" ? "roleT" : "roleCt";
            return (
              <div className={`rq-rolebubble-col ${side.toLowerCase()}`} key={side}>
                <span className="rq-rolebubble-side">{t(`loadout.side.${side}`)}</span>

                {rolesFor(side).map((r) => {
                  const Icon = ROLE_ICON[r.id];
                  const on = mine === r.id;
                  const holders = claims[claimKey(side, r.id)] ?? [];
                  // Somebody else already holds it, and it is one of the two
                  // that only one player may hold. Still clickable: the block
                  // is on the queue, and refusing the click would leave two
                  // people unable to swap without one of them clearing first.
                  const taken = r.unique && holders.some((h) => h !== "you");
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={on}
                      className={`rq-rolebubble-option ${on ? "on" : ""} ${taken && on ? "clash" : ""} ${taken ? "taken" : ""}`}
                      onClick={() => onChange({ [field]: on ? "" : r.id })}
                      onMouseEnter={(e) => arm(side, r.id, e.clientX, e.clientY)}
                      onMouseMove={(e) => {
                        if (!detail) arm(side, r.id, e.clientX, e.clientY);
                      }}
                      onMouseLeave={disarm}
                      onFocus={(e) => {
                        const b = e.currentTarget.getBoundingClientRect();
                        arm(side, r.id, b.right, b.top + b.height / 2);
                      }}
                      onBlur={disarm}
                    >
                      <Icon size={14} />
                      <span className="rq-rolebubble-name">{t(`role.${r.id}.name`)}</span>
                      {!r.unique && <span className="rq-rolebubble-many" title={t("lobby.role.shared")}>∞</span>}
                      {taken && (
                        <span className="rq-rolebubble-taken">
                          {holders.filter((h) => h !== "you").length}
                        </span>
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={!mine}
                  className={`rq-rolebubble-option none ${!mine ? "on" : ""}`}
                  onClick={() => onChange({ [field]: "" })}
                  onMouseEnter={disarm}
                >
                  <Ban size={14} />
                  <span className="rq-rolebubble-name">{t("lobby.role.unset")}</span>
                </button>
              </div>
            );
          })}
        </div>

        {/* One flag for the player, not one per side — so it sits under both
            columns rather than being asked twice. */}
        <button
          type="button"
          className={`rq-rolebubble-caller ${value.isCaller ? "on" : ""} ${
            value.isCaller && callers.length > 1 ? "clash" : ""
          }`}
          aria-pressed={value.isCaller}
          onClick={() => onChange({ isCaller: !value.isCaller })}
          onMouseEnter={disarm}
        >
          <Mic size={14} />
          {t("loadout.role.caller")}
          <span>{t("loadout.role.caller.desc")}</span>
        </button>
      </motion.div>

      {detail && <RoleDetail side={detail.side} roleId={detail.roleId} x={detail.x} y={detail.y} />}
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(body, document.body);
}

/**
 * What this role actually does in a retake, beside the cursor that paused on it.
 *
 * Every line of this is about a planted site with four people walking onto it —
 * not the same word's meaning in a normal round, which is where the difference
 * lives and is the reason the card exists at all.
 */
function RoleDetail({ side, roleId, x, y }: { side: Side; roleId: string; x: number; y: number }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const Icon = ROLE_ICON[roleId];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const gap = 18;
    // To the right of the cursor, and to the left when the right runs out.
    const right = x + gap;
    const left = right + box.width > window.innerWidth - 12 ? x - gap - box.width : right;
    const top = Math.min(
      Math.max(12, y - box.height / 2),
      window.innerHeight - box.height - 12
    );
    setPos({ top, left: Math.max(12, left) });
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      className="rq-roledetail"
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.16 }}
      role="tooltip"
    >
      <header>
        <span className={`rq-roledetail-icon ${side.toLowerCase()}`}>
          <Icon size={18} />
        </span>
        <div>
          <strong>{t(`role.${roleId}.name`)}</strong>
          <span>{t(`loadout.side.${side}`)}</span>
        </div>
      </header>

      {/* The mode's own description, which is what the homepage and the match
          page already show for these roles. The old per-side `retake` copy
          described jobs that no longer exist. */}
      <p>{t(`role.${roleId}.desc`)}</p>

      <footer className={isRoleUnique(roleId) ? "unique" : ""}>
        {isRoleUnique(roleId) ? t("lobby.role.uniqueNote") : t("lobby.role.sharedNote")}
      </footer>
    </motion.div>
  );
}
