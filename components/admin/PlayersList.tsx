"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { useI18n } from "@/components/I18nProvider";

export type AdminPlayer = {
  steamId: string;
  name: string;
  steamName: string;
  hasOverride: boolean;
  lastSeen: string;
  role: number;
  banned: boolean;
  banReason: string | null;
  banExpires: string | null;
};

const ROLE_LABEL = ["—", "Moderator", "Admin", "Owner"];

/**
 * The player list, as rows that open rather than a table of buttons.
 *
 * It was a four-column table with up to seven controls in the last cell of
 * every row — kick, slay, ban, unban, rename, reset, and a role select — laid
 * out as one flat strip. Kicking somebody for the round and making them an
 * Owner sat next to each other, the same size, in the same colour, on every
 * row on screen at once. A hundred players meant seven hundred controls.
 *
 * So: one row per player showing who they are and what is true of them, and
 * the actions behind a click, grouped by what they touch. The grouping is the
 * point — "kick" and "set role" are different kinds of decision, and a flat
 * strip said they were the same one.
 *
 * The styling for this has been in admin.css the whole time, unused. This is
 * the component it was written for.
 */
export default function PlayersList({
  players,
  loading,
  canMod,
  canAdmin,
  canOwner,
  doAction,
}: {
  players: AdminPlayer[];
  loading: boolean;
  canMod: boolean;
  canAdmin: boolean;
  canOwner: boolean;
  doAction: (payload: Record<string, unknown>) => void | Promise<void>;
}) {
  const { t } = useI18n();

  /** Which row is open. One at a time: two open drawers is a table again. */
  const [open, setOpen] = useState<string | null>(null);

  if (players.length === 0) {
    return (
      <p className="adm-pl-empty">
        {loading ? t("auto.adminpanel.loading") : t("auto.adminpanel.no_players_found")}
      </p>
    );
  }

  return (
    <div className="adm-pl-list">
      {players.map((p) => (
        <PlayerRow
          key={p.steamId}
          player={p}
          isOpen={open === p.steamId}
          onToggle={() => setOpen((cur) => (cur === p.steamId ? null : p.steamId))}
          canMod={canMod}
          canAdmin={canAdmin}
          canOwner={canOwner}
          doAction={doAction}
        />
      ))}
    </div>
  );
}

function PlayerRow({
  player: p,
  isOpen,
  onToggle,
  canMod,
  canAdmin,
  canOwner,
  doAction,
}: {
  player: AdminPlayer;
  isOpen: boolean;
  onToggle: () => void;
  canMod: boolean;
  canAdmin: boolean;
  canOwner: boolean;
  doAction: (payload: Record<string, unknown>) => void | Promise<void>;
}) {
  const { t } = useI18n();

  /**
   * The ban form, inline.
   *
   * It was two window.prompt calls in a row — reason, then minutes — which
   * blocks the tab, cannot be cancelled halfway without losing the first
   * answer, and looks like the browser asking rather than the site. Both
   * fields live in the drawer now, which is also why admin.css has an
   * `.input.grow` and an `.input.mins`.
   */
  const [reason, setReason] = useState("Cheating");
  const [minutes, setMinutes] = useState("0");
  const [rename, setRename] = useState(p.name);

  return (
    <>
      <button
        className={`adm-pl-row ${p.banned ? "is-banned" : ""}`}
        aria-expanded={isOpen}
        onClick={onToggle}
      >
        <span className="adm-pl-who">
          <span className="adm-pl-name">
            {p.name}
            {p.hasOverride && <span className="mini-badge">{t("auto.adminpanel.override")}</span>}
          </span>
          <span className="adm-pl-id num">{p.steamId}</span>
        </span>

        {/* What is true of them, not what can be done to them. The role used to
            have a column of its own, which meant a column that read "—" for
            every player who is not staff — which is nearly all of them. */}
        <span className="adm-pl-tags">
          {p.role > 0 && <span className="role-badge sm">{ROLE_LABEL[p.role]}</span>}
          {p.banned && (
            <span className="mini-badge danger" title={p.banReason ?? ""}>
              {t("auto.adminpanel.banned")}
              {p.banExpires ? "" : " ∞"}
            </span>
          )}
        </span>

        <span className="adm-pl-chev" aria-hidden>
          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {isOpen && (
        <div className="adm-pl-open">
          {/* Now, and only now. Nothing here outlives the round. */}
          {canMod && (
            <div className="adm-pl-group">
              <span>{t("admin.players.session")}</span>
              <div className="adm-pl-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => doAction({ type: "kick", name: p.steamName })}
                >
                  {t("auto.adminpanel.kick")}
                </button>
                {canAdmin && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => doAction({ type: "slay", name: p.steamName })}
                  >
                    {t("auto.adminpanel.slay")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Whether they may come back at all. */}
          {canAdmin && (
            <div className="adm-pl-group">
              <span>{t("admin.players.access")}</span>
              <div className="adm-pl-actions">
                {p.banned ? (
                  <button
                    className="btn btn-secondary"
                    onClick={() => doAction({ type: "unban", steamId: p.steamId })}
                  >
                    {t("auto.adminpanel.unban")}
                  </button>
                ) : (
                  <>
                    <input
                      className="input grow"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t("admin.players.banReason")}
                      aria-label={t("admin.players.banReason")}
                    />
                    {/* Blank or zero is permanent, which is the default and is
                        why the field says so rather than being left empty. */}
                    <input
                      className="input mins"
                      value={minutes}
                      onChange={(e) => setMinutes(e.target.value)}
                      placeholder={t("admin.players.banMinutes")}
                      aria-label={t("admin.players.banMinutes")}
                      inputMode="numeric"
                    />
                    <button
                      className="btn btn-secondary"
                      onClick={() =>
                        doAction({
                          type: "ban",
                          steamId: p.steamId,
                          reason,
                          minutes: Number(minutes) || 0,
                        })
                      }
                    >
                      {t("auto.adminpanel.ban")}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* What they are called here. */}
          {canAdmin && (
            <div className="adm-pl-group">
              <span>{t("admin.players.identity")}</span>
              <div className="adm-pl-actions">
                <input
                  className="input grow"
                  value={rename}
                  onChange={(e) => setRename(e.target.value)}
                  aria-label={t("auto.adminpanel.rename")}
                />
                <button
                  className="btn btn-secondary"
                  disabled={rename.trim() === "" || rename === p.name}
                  onClick={() => doAction({ type: "setName", steamId: p.steamId, name: rename })}
                >
                  {t("auto.adminpanel.rename")}
                </button>
                {p.hasOverride && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => doAction({ type: "clearName", steamId: p.steamId })}
                  >
                    {t("auto.adminpanel.reset")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* The one that outlives everything else, so it is last and on its
              own rather than sixth in a row of buttons. */}
          {canOwner && (
            <div className="adm-pl-group">
              <span>{t("admin.players.role")}</span>
              <div className="adm-pl-actions">
                <label className="sr-only" htmlFor={`role-${p.steamId}`}>
                  {t("auto.adminpanel.role_for")} {p.name}
                </label>
                <select
                  id={`role-${p.steamId}`}
                  className="input"
                  value={p.role}
                  onChange={(e) => {
                    const level = Number(e.target.value);
                    if (level === 0) doAction({ type: "removeRole", steamId: p.steamId });
                    else doAction({ type: "setRole", steamId: p.steamId, level });
                  }}
                >
                  <option value={0}>{t("auto.adminpanel.no_role")}</option>
                  <option value={1}>{t("auto.adminpanel.moderator")}</option>
                  <option value={2}>{t("auto.adminpanel.admin")}</option>
                  <option value={3}>{t("auto.adminpanel.owner")}</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
