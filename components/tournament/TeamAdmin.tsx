"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { canActOn, teamCan, type TeamRole } from "@/lib/tournament/teams";

type Member = { steamId: string; name: string; role: TeamRole };

/**
 * Running a standing team.
 *
 * Every control here asks lib/tournament/teams.ts whether it should exist, so
 * the page and the server agree by construction rather than by two people
 * remembering the same rules. The server checks again — a hidden button is not
 * a permission — but nothing is offered that would then be refused, which is
 * the difference between a UI that is safe and one that is honest.
 *
 * A plain player sees one thing: Leave.
 */
export default function TeamAdmin({
  teamId,
  slug,
  name,
  tag,
  bio,
  myRole,
  members,
}: {
  teamId: number;
  slug: string;
  name: string;
  tag: string | null;
  bio: string | null;
  myRole: TeamRole;
  members: Member[];
}) {
  const { t } = useI18n();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [draftName, setDraftName] = useState(name);
  const [draftTag, setDraftTag] = useState(tag ?? "");
  const [draftBio, setDraftBio] = useState(bio ?? "");
  const [invite, setInvite] = useState("");

  const send = useCallback(
    async (body: Record<string, unknown>, after?: "reload" | "leave") => {
      setBusy(true);
      setNote(null);

      try {
        const res = await fetch("/api/teams", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, teamId }),
        });

        const data = await res.json();

        if (!res.ok || data.error) {
          setNote({ kind: "error", text: String(data.error ?? "That did not work.") });
          return;
        }

        setNote({ kind: "ok", text: t("teams.saved") });
        if (after === "leave") router.push("/teams");
        else router.refresh();
      } catch (err) {
        setNote({ kind: "error", text: String(err) });
      } finally {
        setBusy(false);
      }
    },
    [teamId, router, t],
  );

  const canEdit = teamCan(myRole, "edit");

  return (
    <div className="tm-admin">
      <div className="admin-head">
        <h2>
          <Settings2 size={16} aria-hidden /> {t("teams.manage")}
        </h2>
        <span className="role-badge">{t(`teams.role.${myRole}`)}</span>
      </div>

      {canEdit && (
        <>
          <div className="tm-fields">
            <label>
              <span>{t("teams.name")}</span>
              <input value={draftName} onChange={(e) => setDraftName(e.target.value)} maxLength={64} />
            </label>
            <label>
              <span>{t("teams.tag")}</span>
              <input value={draftTag} onChange={(e) => setDraftTag(e.target.value)} maxLength={8} />
            </label>
          </div>

          <label className="tm-field-wide">
            <span>{t("teams.bio")}</span>
            <textarea
              value={draftBio}
              onChange={(e) => setDraftBio(e.target.value)}
              maxLength={2000}
              rows={2}
            />
          </label>

          <div className="tm-actions">
            <button
              className="btn btn-primary"
              disabled={busy || draftName.trim().length < 2}
              onClick={() =>
                send({ action: "rename", name: draftName.trim(), tag: draftTag.trim() || null, bio: draftBio.trim() || null })
              }
            >
              {t("teams.save")}
            </button>
            {/* The URL does not follow a rename on purpose: a link somebody has
                already shared outlives a change of mind about the name. */}
            <span className="muted tm-hint">{t("teams.slugStays", { slug })}</span>
          </div>

          <div className="tm-block">
            <h3>{t("teams.addMember")}</h3>
            <p className="muted tm-hint">{t("teams.addMemberWhy")}</p>
            <div className="tm-actions">
              <input
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                placeholder="7656119…"
                inputMode="numeric"
              />
              <button
                className="btn"
                disabled={busy || !invite.trim()}
                onClick={() => send({ action: "invite", steamId: invite.trim() })}
              >
                {t("teams.add")}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="tm-block">
        <h3>{t("teams.roster")}</h3>
        <ul className="tm-manage-list">
          {members.map((m) => {
            const actionable = canActOn(myRole, m.role);

            return (
              <li key={m.steamId}>
                <span className="tm-member-name">{m.name}</span>
                <span className={`tm-role ${m.role}`}>{t(`teams.role.${m.role}`)}</span>

                {actionable && teamCan(myRole, "promote") && (
                  <button
                    className="btn small"
                    disabled={busy}
                    onClick={() =>
                      send({
                        action: "role",
                        steamId: m.steamId,
                        role: m.role === "manager" ? "player" : "manager",
                      })
                    }
                  >
                    {m.role === "manager" ? t("teams.demote") : t("teams.promote")}
                  </button>
                )}

                {actionable && teamCan(myRole, "remove") && (
                  <button
                    className="btn small btn-ghost"
                    disabled={busy}
                    onClick={() => send({ action: "remove", steamId: m.steamId })}
                  >
                    {t("teams.remove")}
                  </button>
                )}

                {/* Handing the team over is the captain's alone, and it is
                    deliberately not next to "promote": one makes somebody a
                    manager, the other stops you being the captain. */}
                {teamCan(myRole, "transfer") && m.role !== "captain" && (
                  <button
                    className="btn small btn-ghost tm-danger"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm(t("teams.transferConfirm", { name: m.name }))) return;
                      send({ action: "transfer", steamId: m.steamId });
                    }}
                  >
                    {t("teams.transfer")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="tm-block tm-danger-zone">
        {myRole !== "captain" && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => send({ action: "leave" }, "leave")}>
            {t("teams.leave")}
          </button>
        )}

        {teamCan(myRole, "delete") && (
          <button
            className="btn btn-ghost tm-danger"
            disabled={busy}
            onClick={() => {
              if (!confirm(t("teams.deleteConfirm", { name }))) return;
              send({ action: "delete" }, "leave");
            }}
          >
            {t("teams.delete")}
          </button>
        )}

        {myRole === "captain" && (
          <span className="muted tm-hint">{t("teams.captainCannotLeave")}</span>
        )}
      </div>

      {note && <p className={`tm-note ${note.kind}`}>{note.text}</p>}
    </div>
  );
}
