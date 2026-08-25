"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import "./register.css";

// Captains registering a team.
//
// Everything here is one person's decision about their own team, so it is
// session-authenticated and never keyed. A captain invites; the person invited
// accepts. Both halves are recorded, which is what makes a roster something you
// can point at when somebody says they were never asked.

type Member = {
  steamId: string;
  status: string;
  isCaptain: boolean;
  roleT: string | null;
  roleCt: string | null;
};

const CT_ROLES = ["frontrunner", "backup", "roamer", "awper"];
const T_ROLES = ["planter", "rifler", "sniper"];

type Membership = {
  status: string;
  isCaptain: boolean;
  team: { id: number; name: string; tag: string | null; status: string; members: Member[] };
};

export default function Register({
  tournamentId,
  teamSize,
  open,
}: {
  tournamentId: number;
  teamSize: number;
  open: boolean;
}) {
  const { t } = useI18n();
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [teamName, setTeamName] = useState("");
  const [tag, setTag] = useState("");
  const [invite, setInvite] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tournament/teams?tournamentId=${tournamentId}`, { cache: "no-store" });

      if (res.status === 401) {
        setMemberships([]);
        setMe(null);
        return;
      }

      const data = await res.json();
      setMemberships(data.memberships ?? []);
      setMe(data.steamId ?? null);
    } catch {
      setMemberships([]);
    }
  }, [tournamentId]);

  useEffect(() => {
    load();
  }, [load]);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setNotice(null);

      try {
        const res = await fetch("/api/tournament/teams", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok) setNotice(data.error ?? t("register.failed"));

        await load();
        return res.ok;
      } catch (err) {
        setNotice(String(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load, t],
  );

  if (memberships === null) return <p className="muted">{t("register.loading")}</p>;

  if (!me) {
    return (
      <div className="empty-hint">
        <p style={{ margin: 0 }}>{t("register.signIn")}</p>
        <a className="btn" style={{ marginTop: 12 }} href="/api/auth/steam/login">
          {t("auto.page.sign_in_with_steam")}
        </a>
      </div>
    );
  }

  const mine = memberships.find((m) => m.status === "accepted" && m.team.status !== "withdrawn");
  const invitations = memberships.filter((m) => m.status === "invited");

  return (
    <div className="rg">
      {notice && <p className="rg-notice">{notice}</p>}

      {invitations.length > 0 && (
        <div className="rg-invites">
          <h3>{t("register.invitations")}</h3>
          {invitations.map((m) => (
            <div key={m.team.id} className="rg-invite">
              <strong>{m.team.name}</strong>
              <button className="btn btn-primary" disabled={busy} onClick={() => act({ action: "accept", teamId: m.team.id })}>
                {t("register.accept")}
              </button>
              <button className="btn" disabled={busy} onClick={() => act({ action: "decline", teamId: m.team.id })}>
                {t("register.decline")}
              </button>
            </div>
          ))}
        </div>
      )}

      {mine ? (
        <div className="rg-team">
          <h3>
            {mine.team.tag && <span className="chip">{mine.team.tag}</span>} {mine.team.name}
          </h3>

          <ul className="rg-members">
            {mine.team.members
              .filter((x) => x.status !== "removed" && x.status !== "declined")
              .map((x) => (
                <li key={x.steamId}>
                  <code>{x.steamId}</code>
                  {x.isCaptain && <span className="chip">{t("register.captain")}</span>}
                  <span className={`rg-status ${x.status}`}>{x.status}</span>

                  {/* A player sets their own; a captain sets anybody's. Building
                      a team sheet before everyone has logged in is the normal
                      case, not an exception. */}
                  {(mine.isCaptain || x.steamId === me) && x.status === "accepted" && (
                    <>
                      <select
                        value={x.roleT ?? ""}
                        disabled={busy}
                        onChange={(e) =>
                          act({
                            action: "role",
                            teamId: mine.team.id,
                            steamId: x.steamId,
                            roleT: e.target.value,
                            roleCt: x.roleCt ?? "",
                          })
                        }
                      >
                        <option value="">{t("register.noRoleT")}</option>
                        {T_ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>

                      <select
                        value={x.roleCt ?? ""}
                        disabled={busy}
                        onChange={(e) =>
                          act({
                            action: "role",
                            teamId: mine.team.id,
                            steamId: x.steamId,
                            roleT: x.roleT ?? "",
                            roleCt: e.target.value,
                          })
                        }
                      >
                        <option value="">{t("register.noRoleCt")}</option>
                        {CT_ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </>
                  )}

                  {mine.isCaptain && !x.isCaptain && (
                    <button
                      className="btn rg-small"
                      disabled={busy}
                      onClick={() => act({ action: "kick", teamId: mine.team.id, steamId: x.steamId })}
                    >
                      {t("register.remove")}
                    </button>
                  )}
                </li>
              ))}
          </ul>

          <p className="muted rg-count">
            {t("register.needed", {
              n: String(mine.team.members.filter((x) => x.status === "accepted").length),
              size: String(teamSize),
            })}
          </p>

          {mine.isCaptain && open && (
            <form
              className="rg-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await act({ action: "invite", teamId: mine.team.id, steamId: invite.trim() })) {
                  setInvite("");
                }
              }}
            >
              <input
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                placeholder={t("register.steamIdPlaceholder")}
                inputMode="numeric"
              />
              <button className="btn btn-primary" disabled={busy || invite.trim().length !== 17}>
                {t("register.invite")}
              </button>
            </form>
          )}

          <button className="btn rg-leave" disabled={busy} onClick={() => act({ action: "leave", teamId: mine.team.id })}>
            {mine.isCaptain ? t("register.withdraw") : t("register.leave")}
          </button>
        </div>
      ) : open ? (
        <form
          className="rg-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act({ action: "create", tournamentId, name: teamName.trim(), tag: tag.trim() })) {
              setTeamName("");
              setTag("");
            }
          }}
        >
          <input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder={t("register.teamName")} maxLength={64} />
          <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder={t("register.tag")} maxLength={8} className="rg-tag" />
          <button className="btn btn-primary" disabled={busy || teamName.trim().length < 2}>
            {t("register.create")}
          </button>
        </form>
      ) : (
        <p className="muted">{t("register.closed")}</p>
      )}
    </div>
  );
}
