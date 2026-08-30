"use client";

import { useState } from "react";
import { Bell, BellOff } from "lucide-react";

import { useI18n } from "@/components/I18nProvider";
import { useSocket } from "@/components/SocketProvider";

/**
 * Follow an org, to hear about the next event.
 *
 * The count is shown next to the button rather than as a separate stat: it is
 * the only number on the page that says whether anybody is paying attention,
 * and on its own somewhere else it reads as vanity rather than as context for
 * the decision to press the button.
 */
export default function FollowOrg({
  orgId,
  initialFollowing,
  initialFollowers,
}: {
  orgId: number;
  initialFollowing: boolean;
  initialFollowers: number;
}) {
  const { t } = useI18n();
  const { steamId } = useSocket();

  const [following, setFollowing] = useState(initialFollowing);
  const [followers, setFollowers] = useState(initialFollowers);
  const [busy, setBusy] = useState(false);

  if (!steamId) {
    return <span className="org-followers">{t("org.followers", { n: String(followers) })}</span>;
  }

  const toggle = async () => {
    if (busy) return;
    setBusy(true);

    // Flipped first. The button is a toggle and a toggle that waits for a round
    // trip before moving feels broken; the server's answer replaces this a
    // moment later either way.
    const next = !following;
    setFollowing(next);
    setFollowers((n) => n + (next ? 1 : -1));

    try {
      const res = await fetch("/api/orgs/follow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      const data = await res.json().catch(() => null);
      if (data?.ok) {
        setFollowing(Boolean(data.following));
        setFollowers(Number(data.followers) || 0);
      } else {
        setFollowing(!next);
        setFollowers((n) => n + (next ? -1 : 1));
      }
    } catch {
      setFollowing(!next);
      setFollowers((n) => n + (next ? -1 : 1));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className={`org-follow ${following ? "on" : ""}`} onClick={toggle} disabled={busy}>
      {following ? <BellOff size={14} /> : <Bell size={14} />}
      <span>{t(following ? "org.unfollow" : "org.follow")}</span>
      <span className="org-follow-count">{followers}</span>
    </button>
  );
}
