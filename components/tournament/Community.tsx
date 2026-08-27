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
  showTeamSpeak = true,
}: {
  discordUrl: string | null;
  teamSpeakUrl: string | null;
  twitchChannels: string | null;
  /**
   * Whether this viewer may see the voice server.
   *
   * Decided on the server and passed in as a boolean, never computed here —
   * an address hidden by a client-side condition is an address that was sent
   * to the browser anyway and is one devtools panel away. Organizers and
   * admins always; registered players once the tournament has started.
   */
  showTeamSpeak?: boolean;
}) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);

  const channels = (twitchChannels ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const teamSpeakAddress = teamSpeakConnect(teamSpeakUrl);

  if (!discordUrl && !(showTeamSpeak && teamSpeakUrl) && channels.length === 0) return null;

  // Twitch refuses to embed unless the parent domain is declared, and it must
  // be the domain actually serving the page — hardcoding it breaks previews and
  // localhost, both of which are where this gets tested.
  const parent = typeof window === "undefined" ? "" : window.location.hostname;

  return (
    <section className="cm">
      {(discordUrl || showTeamSpeak) && (
        <div className="cm-links">
          {discordUrl && (
            <a className="cm-link cm-discord" href={discordUrl} target="_blank" rel="noreferrer noopener">
              <DiscordMark />
              <span className="cm-link-text">
                <strong>Discord</strong>
                <small>{t("community.discordHint")}</small>
              </span>
            </a>
          )}

          {showTeamSpeak && teamSpeakUrl && (
            <a className="cm-link cm-ts" href={teamSpeakAddress.href} target="_blank" rel="noreferrer noopener">
              <TeamSpeakMark />
              <span className="cm-link-text">
                <strong>TeamSpeak</strong>
                {/* The address in full, selectable. The connect link only works
                    for people who have the client installed and its protocol
                    handler registered; everybody else needs to be able to read
                    the address and paste it in by hand. */}
                <small className="cm-address">{teamSpeakAddress.label}</small>
              </span>
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

/**
 * A TeamSpeak address, as something to click and something to read.
 *
 * Organizers type whatever they have: a bare host, a host:port, or a full
 * ts3server:// URL. All three end up here, and all three need to produce a
 * link the client can act on plus a plain address a player can copy into the
 * connect box by hand — the protocol handler only exists on machines with the
 * client already installed, so the readable form is not a fallback, it is the
 * path most people take.
 */
function teamSpeakConnect(raw: string | null): { href: string; label: string } {
  const value = (raw ?? "").trim();
  if (!value) return { href: "", label: "" };

  // Already a protocol URL: keep it, and show it without the scheme.
  if (/^ts3server:\/\//i.test(value)) {
    return { href: value, label: value.replace(/^ts3server:\/\//i, "") };
  }

  // Anything else is an address. Strip a scheme somebody pasted by habit.
  const address = value.replace(/^[a-z0-9+.-]+:\/\//i, "");

  // ts3server:// takes the port as a query parameter, not after a colon.
  const [host, port] = address.split(":");
  const href = port
    ? `ts3server://${encodeURIComponent(host)}?port=${encodeURIComponent(port)}`
    : `ts3server://${encodeURIComponent(host)}`;

  return { href, label: address };
}

/* Brand marks inline rather than from an icon set: neither of these is in
   lucide, and a <img> to a CDN is a third-party request on every tournament
   page for two logos. */

function DiscordMark() {
  return (
    <svg className="cm-mark" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M20.32 4.57A19.79 19.79 0 0 0 15.43 3c-.24.42-.5.98-.69 1.43a18.3 18.3 0 0 0-5.48 0C9.07 3.98 8.8 3.42 8.56 3a19.74 19.74 0 0 0-4.89 1.57C.56 9.2-.28 13.7.14 18.14a19.9 19.9 0 0 0 6.06 3.07c.49-.67.92-1.38 1.3-2.13-.71-.27-1.4-.6-2.04-.99.17-.13.34-.26.5-.4a14.2 14.2 0 0 0 12.1 0c.16.14.33.27.5.4-.65.39-1.33.72-2.05.99.37.75.81 1.46 1.3 2.13a19.87 19.87 0 0 0 6.06-3.07c.5-5.15-.84-9.6-3.55-13.57ZM8.02 15.42c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Zm7.96 0c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42c1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42Z"
      />
    </svg>
  );
}

function TeamSpeakMark() {
  return (
    <svg className="cm-mark" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-10 10v4.5A2.5 2.5 0 0 0 4.5 19H6a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H4.2a7.8 7.8 0 0 1 15.6 0H18a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h.5a2.5 2.5 0 0 1-2.5 2H13a1 1 0 1 0 0 2h3a4.5 4.5 0 0 0 4.45-4A2.5 2.5 0 0 0 22 16.5V12A10 10 0 0 0 12 2Z"
      />
    </svg>
  );
}
