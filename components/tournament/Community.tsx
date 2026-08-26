"use client";

import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import "./community.css";

// Discord, TeamSpeak and the streams.
//
// The streams are the constraint here. An embedded Twitch player wants to be
// enormous, and a tournament page is about the bracket — so they are laid out
// small, several across, and only one is expanded at a time. Somebody who
// actually wants to watch has Twitch for that; this is for knowing a stream
// exists and glancing at it.

export default function Community({
  discordUrl,
  teamSpeakUrl,
  twitchChannels,
}: {
  discordUrl: string | null;
  teamSpeakUrl: string | null;
  twitchChannels: string | null;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);

  const channels = (twitchChannels ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  if (!discordUrl && !teamSpeakUrl && channels.length === 0) return null;

  // Twitch refuses to embed unless the parent domain is declared, and it must
  // be the domain actually serving the page — hardcoding it breaks previews and
  // localhost, both of which are where this gets tested.
  const parent = typeof window === "undefined" ? "" : window.location.hostname;

  return (
    <section className="cm">
      {(discordUrl || teamSpeakUrl) && (
        <div className="cm-links">
          {discordUrl && (
            <a className="btn btn-secondary" href={discordUrl} target="_blank" rel="noreferrer noopener">
              Discord
            </a>
          )}
          {teamSpeakUrl && (
            <a className="btn btn-secondary" href={teamSpeakUrl} target="_blank" rel="noreferrer noopener">
              TeamSpeak
            </a>
          )}
        </div>
      )}

      {channels.length > 0 && parent && (
        <div className="cm-streams">
          {channels.map((channel) => {
            const open = expanded === channel;
            return (
              <div key={channel} className={`cm-stream ${open ? "open" : ""}`}>
                <header className="cm-stream-head">
                  <span className="cm-channel">{channel}</span>
                  <button
                    className="btn cm-small"
                    onClick={() => setExpanded(open ? null : channel)}
                  >
                    {open ? t("community.shrink") : t("community.expand")}
                  </button>
                  <a
                    className="btn cm-small"
                    href={`https://twitch.tv/${channel}`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {t("community.openTwitch")}
                  </a>
                </header>

                <div className="cm-frame">
                  <iframe
                    title={channel}
                    src={`https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parent)}&muted=true`}
                    allowFullScreen
                    // No autoplay with sound, ever: several of these can be on
                    // one page and a tournament bracket that shouts at you when
                    // it loads is a page people close.
                    allow="fullscreen"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
