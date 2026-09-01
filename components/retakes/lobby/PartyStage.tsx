"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Plus, X, Link2, Check } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import LevelBadge from "@/components/retakes/LevelBadge";
import SafeShield from "@/components/retakes/SafeShield";
import { FormLine, type RecentForm } from "@/components/retakes/PlayerForm";
import RolePicker, { type RoleClaims, type RoleState } from "./RolePicker";
import PlayerBubble from "@/components/social/PlayerBubble";

export type Seat = {
  steamId: string;
  name: string;
  avatar?: string;
  leader: boolean;
  me: boolean;
  elo?: number;
  matches?: number;
  safe?: { score: number; probation: boolean };
  form?: RecentForm;
  role: RoleState;
};

export type Invitable = { friendId: string; name: string };

/**
 * The party, in the middle of the screen, with the button under it.
 *
 * It used to be a list down a 300px column on the left while the right-hand
 * two-thirds held a role form and the queue buttons, so the thing the page is
 * about — who is playing — was the narrowest and least prominent element on it.
 * Every lobby worth copying does the opposite: the faces are the centre, the
 * button is directly beneath them, and everything you can change about the
 * queue is one row further down.
 *
 * A seat is one player, and their roles hang under their face rather than in a
 * panel somewhere else, so "who is the sniper" is answered by looking at the
 * party instead of by reading a list.
 *
 * Empty seats are the invite control. Clicking one opens the friends who are
 * online and not already here, plus the link — the same two ways in, at the
 * point where the gap actually is.
 */
export default function PartyStage({
  seats,
  capacity,
  pending,
  claims,
  callers,
  canKick,
  canInvite,
  invitable,
  noFriendsNote,
  onRole,
  onKick,
  onInvite,
  onCopyLink,
}: {
  seats: Seat[];
  capacity: number;
  pending: { id: string; name: string; expiresAt: number }[];
  claims: RoleClaims;
  callers: string[];
  canKick: boolean;
  canInvite: boolean;
  invitable: Invitable[];
  noFriendsNote: string;
  onRole: (next: Partial<RoleState>) => void;
  onKick: (steamId: string) => void;
  onInvite: (f: Invitable) => void;
  onCopyLink: () => void;
}) {
  const { t } = useI18n();
  const [invite, setInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!invite) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node)) setInvite(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInvite(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [invite]);

  const empties = Math.max(0, capacity - seats.length - pending.length);

  return (
    <div className="rq-stage-party">
      <ul className="rq-seats">
        {seats.map((s) => (
          <li key={s.steamId} className={`rq-seat ${s.me ? "me" : ""}`}>
            <div className="rq-seat-face">
              {s.avatar ? (
                <img src={s.avatar} alt="" draggable={false} />
              ) : (
                <span className="rq-seat-initial">{s.name.slice(0, 1).toUpperCase()}</span>
              )}
              {s.leader && (
                <span className="rq-seat-crown" title={t("lobby.leader")}>
                  ★
                </span>
              )}
              {canKick && !s.me && (
                <button
                  type="button"
                  className="rq-seat-kick"
                  onClick={() => onKick(s.steamId)}
                  aria-label={t("lobby.kick")}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* The name opens the player card — rating, form, whether you
                are already friends, and the way to their profile. A lobby is
                where you meet people you have never played with, so it is the
                place that question gets asked most, and the name was inert. */}
            <PlayerBubble steamId={s.steamId} name={s.name}>
              <span className="rq-seat-name is-clickable" title={s.name}>
                {s.name}
                {s.safe && <SafeShield score={s.safe.score} probation={s.safe.probation} />}
              </span>
            </PlayerBubble>

            <span className="rq-seat-meta">
              <LevelBadge elo={s.elo} matches={s.matches} size="sm" />
              <FormLine form={s.form} />
            </span>

            {/* The roles, under the face. Only yours opens. */}
            <RolePicker
              value={s.role}
              editable={s.me}
              claims={claims}
              callers={callers}
              onChange={onRole}
            />
          </li>
        ))}

        {pending.map((p) => (
          <li key={`pending-${p.id}`} className="rq-seat pending">
            <div className="rq-seat-face ghost">
              <span className="rq-seat-initial">{p.name.slice(0, 1).toUpperCase()}</span>
            </div>
            <span className="rq-seat-name">{p.name}</span>
            <span className="rq-seat-meta muted">
              {t("lobby.stage.inviting", {
                n: Math.max(0, Math.round((p.expiresAt - Date.now()) / 1000)),
              })}
            </span>
          </li>
        ))}

        {Array.from({ length: empties }).map((_, i) => (
          <li key={`empty-${i}`} className="rq-seat empty">
            <button
              type="button"
              className="rq-seat-add"
              onClick={() => setInvite((v) => !v)}
              disabled={!canInvite}
              aria-expanded={invite}
              aria-haspopup="dialog"
              title={canInvite ? t("lobby.stage.add") : t("lobby.leaderqueues")}
            >
              <Plus size={22} />
            </button>
            <span className="rq-seat-name muted">{t("lobby.emptyslot")}</span>

            {/* One popover for all the empty seats — anchored to the first, so
                two gaps do not put two identical panels on screen. */}
            {invite && i === 0 && (
              <motion.div
                ref={popRef}
                className="rq-invitepop"
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 440, damping: 34 }}
                role="dialog"
                aria-label={t("lobby.invitefriends")}
              >
                <div className="rq-invitepop-head">
                  <strong>{t("lobby.invitefriends")}</strong>
                  <button type="button" onClick={() => setInvite(false)} aria-label={t("lobby.gate.close")}>
                    <X size={14} />
                  </button>
                </div>

                {invitable.length === 0 ? (
                  <p className="rq-invitepop-empty">{noFriendsNote}</p>
                ) : (
                  <ul className="rq-invitepop-list">
                    {invitable.map((f) => (
                      <li key={f.friendId}>
                        <span className="rq-avatar sm" aria-hidden>
                          {f.name.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="rq-member-name">{f.name}</span>
                        <button
                          type="button"
                          className="btn btn-secondary rq-invite"
                          onClick={() => {
                            onInvite(f);
                            setInvite(false);
                          }}
                        >
                          {t("lobby.invite")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  className="rq-invitepop-link"
                  onClick={() => {
                    onCopyLink();
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? <Check size={14} /> : <Link2 size={14} />}
                  {copied ? t("lobby.stage.linkCopied") : t("lobby.stage.copyLink")}
                </button>
              </motion.div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
