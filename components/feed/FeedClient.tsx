"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ClipCard, { type Clip } from "@/components/feed/ClipCard";
import UploadClipModal from "@/components/feed/UploadClipModal";
import { useI18n } from '@/components/I18nProvider';
import { CLIP_TAGS } from "@/lib/feedShared";

// The feed: community clips, plus CS2's own update stream.
//
// Range and sort live in the URL so a filtered feed can be linked and the back
// button behaves — same reasoning as the inventory workspace.

type Update = { id: string; title: string; url: string; date: string; summary: string; source: string };
type Tab = "clips" | "updates";
type Range = "day" | "week" | "month" | "all";
type Sort = "new" | "likes" | "comments";

const RANGES: { id: Range; label: string }[] = [
  { id: "day", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "all", label: "All time" },
];

type Kind = "" | "r2" | "upload" | "youtube";

const KINDS: { id: Kind; label: string }[] = [
  { id: "", label: "Everything" },
  { id: "r2", label: "From demos" },
  { id: "upload", label: "Uploads" },
  { id: "youtube", label: "YouTube" },
];

export default function FeedClient({ signedIn, isAdmin = false }: { signedIn: boolean; isAdmin?: boolean }) {
    const { t } = useI18n();

  const [tab, setTab] = useState<Tab>("clips");
  const [range, setRange] = useState<Range>("week");
  const [sort, setSort] = useState<Sort>("new");
  const [kind, setKind] = useState<Kind>("");
  const [tag, setTag] = useState("");
  const [query, setQuery] = useState("");
  /** Debounced, so typing does not fire a request per keystroke. */
  const [search, setSearch] = useState("");

  const [clips, setClips] = useState<Clip[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** How many clips arrived since this view was loaded, if we did not take them. */
  const [pending, setPending] = useState(0);
  /** What the server had last time we looked, to tell new from merely reordered. */
  const seen = useRef<{ latestId: number; total: number } | null>(null);
  const [updates, setUpdates] = useState<Update[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  /** A clip id from ?clip= — a notification links here rather than to the bare
   *  share page, which has no navigation and reads as a broken link. */
  const [openClipId, setOpenClipId] = useState<number | null>(null);

  useEffect(() => {
    const c = Number(new URLSearchParams(window.location.search).get("clip"));
    if (Number.isInteger(c) && c > 0) {
      setOpenClipId(c);
      // All time, newest first, so the clip is certain to be in the list.
      setRange("all");
      setSort("new");
    }
  }, []);

  // Restore filters from the URL once on mount.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const r = q.get("range");
    const s = q.get("sort");
    const t = q.get("tab");
    if (r && RANGES.some((x) => x.id === r)) setRange(r as Range);
    if (s === "likes" || s === "new") setSort(s);
    if (t === "updates" || t === "clips") setTab(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setSearch(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const loadClips = useCallback(async () => {
    setError(null);
    setPending(0);
    try {
      const params = new URLSearchParams({ range, sort });
      if (kind) params.set("kind", kind);
      if (tag) params.set("tag", tag);
      if (search) params.set("q", search);
      const res = await fetch(`/api/feed?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not load the feed.");
        setClips([]);
        return;
      }
      setClips(json.clips);
      // Re-baseline: whatever is on screen now is what we have seen.
      try {
        const l = await fetch("/api/feed/latest", { cache: "no-store" }).then((r) => r.json());
        seen.current = { latestId: l.latestId ?? 0, total: l.total ?? 0 };
      } catch {
        /* the poller will pick it up */
      }
    } catch {
      setError("Could not reach the server.");
      setClips([]);
    }
  }, [range, sort, kind, search, tag]);

  useEffect(() => {
    if (tab === "clips") loadClips();
  }, [tab, loadClips]);

  /** Reload without touching the rest of the page. */
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadClips();
    } finally {
      setRefreshing(false);
    }
  }, [loadClips]);

  // Watch for clips posted while this tab is open.
  //
  // New ones are pulled in silently when you are at the top of the feed, where
  // the list growing is what you would expect. Once scrolled down they are
  // announced instead and wait for a click — reordering the page under someone
  // reading a clip, or half-way through a comment, would be hostile.
  //
  // Polling pauses on a hidden tab: a backgrounded feed does not need to know.
  useEffect(() => {
    if (tab !== "clips") return;

    const tick = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch("/api/feed/latest", { cache: "no-store" });
        if (!res.ok) return;
        const { latestId = 0, total = 0 } = await res.json();
        const before = seen.current;
        if (!before) {
          seen.current = { latestId, total };
          return;
        }
        if (latestId === before.latestId && total === before.total) return;

        const added = Math.max(0, latestId > before.latestId ? total - before.total : 0);
        const scroller = document.querySelector<HTMLElement>(".main-content");
        const atTop = (scroller?.scrollTop ?? window.scrollY) < 80;

        if (atTop && !document.querySelector(".clip-modal, .pro-modal")) {
          await loadClips();
        } else {
          seen.current = { latestId, total };
          setPending((n) => n + (added || 1));
        }
      } catch {
        /* offline, or the server is restarting — try again next tick */
      }
    };

    const id = window.setInterval(tick, 30_000);
    const onVisible = () => !document.hidden && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [tab, loadClips]);

  useEffect(() => {
    if (tab !== "updates" || updates !== null) return;
    fetch("/api/feed/updates")
      .then((r) => r.json())
      .then((j) => setUpdates(j.updates ?? []))
      .catch(() => setUpdates([]));
  }, [tab, updates]);

  // Keep the URL in step without a server round trip.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    q.set("tab", tab);
    if (tab === "clips") {
      q.set("range", range);
      q.set("sort", sort);
    } else {
      q.delete("range");
      q.delete("sort");
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
  }, [tab, range, sort]);

  return (
    <>
      <section className="pro-hero">
        <div className="feed-head">
          <div>
            <span className="kicker">{t("auto.feedclient.feed")}</span>
            <h1 style={{ fontSize: "clamp(30px, 4.6vw, 54px)", letterSpacing: "-0.025em", margin: "10px 0 6px" }}>
              {t("auto.feedclient.clips_amp_updates")}
                                      </h1>
            <p className="muted" style={{ maxWidth: "54ch", margin: 0 }}>
              {t("auto.feedclient.community_highlights_from_the")}
                                      </p>
          </div>
          {signedIn ? (
            <button className="btn btn-primary" onClick={() => setUploading(true)}>{t("auto.feedclient.post_a_clip")}</button>
          ) : (
            <a className="btn btn-secondary" href="/api/auth/steam/login">{t("auto.feedclient.sign_in_to_post")}</a>
          )}
        </div>
      </section>

      <section className="pro-section">
        <div className="pro-tabs" role="tablist" aria-label={t("auto.feedclient.feed")}>
          {([
            { id: "clips" as Tab, label: "Clips" },
            { id: "updates" as Tab, label: "CS2 updates" },
          ]).map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`pro-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pro-panel">
          {tab === "clips" ? (
            <>
              <div className="feed-search">
                <label className="sr-only" htmlFor="feed-q">{t("auto.feedclient.search_clips")}</label>
                <input
                  id="feed-q"
                  className="input"
                  type="search"
                  value={query}
                  placeholder={t("auto.feedclient.search_a_player_a_title_a_map")}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button className="btn btn-ghost" onClick={() => setQuery("")}>{t("auto.feedclient.clear")}</button>
                )}
                <button
                  className="btn btn-secondary feed-refresh"
                  onClick={refresh}
                  disabled={refreshing}
                  title={t("auto.feedclient.reload_the_clips_without_reloa")}
                >
                  <span aria-hidden className={refreshing ? "spin" : ""}>⟳</span> {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>

              {pending > 0 && (
                <button className="feed-new-pill" onClick={refresh}>
                  {pending} {t("auto.feedclient.new_clip")}{pending === 1 ? "" : "s"} {t("auto.feedclient._show")}
                                                  </button>
              )}

              <div className="feed-filters">
                <div className="feed-filter-group" role="group" aria-label={t("auto.feedclient.time_range")}>
                  {RANGES.map((r) => (
                    <button key={r.id} className={`chip ${range === r.id ? "active" : ""}`} onClick={() => setRange(r.id)}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="feed-filter-group" role="group" aria-label={t("auto.feedclient.source")}>
                  {KINDS.map((k) => (
                    <button key={k.id} className={`chip ${kind === k.id ? "active" : ""}`} onClick={() => setKind(k.id)}>
                      {k.label}
                    </button>
                  ))}
                </div>
                <div className="feed-filter-group feed-tagfilter" role="group" aria-label={t("auto.feedclient.tag")}>
                  {CLIP_TAGS.map((t) => (
                    <button
                      key={t.id}
                      className={`clip-tag pick ${tag === t.id ? "on" : ""}`}
                      style={{ ["--tint" as string]: t.colour }}
                      aria-pressed={tag === t.id}
                      onClick={() => setTag(tag === t.id ? "" : t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="feed-filter-group" role="group" aria-label={t("auto.feedclient.sort")}>
                  <button className={`chip ${sort === "new" ? "active" : ""}`} onClick={() => setSort("new")}>{t("auto.feedclient.newest")}</button>
                  <button className={`chip ${sort === "likes" ? "active" : ""}`} onClick={() => setSort("likes")}>{t("auto.feedclient.most_liked")}</button>
                  <button className={`chip ${sort === "comments" ? "active" : ""}`} onClick={() => setSort("comments" as Sort)}>{t("auto.feedclient.most_discussed")}</button>
                </div>
              </div>

              {error && (
                <p className="skin-note skin-note-error" role="alert">
                  <span><strong>{t("auto.feedclient.feed_unavailable")}</strong> {error}</span>
                </p>
              )}

              {clips === null ? (
                /* Skeleton cards rather than a line of text: the grid keeps its
                   shape while loading, so nothing jumps when the clips land and
                   the page does not appear empty for a moment first. */
                <div className="feed-grid" aria-busy="true">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <article key={i} className="clip clip-skeleton">
                      <div className="clip-skel-head">
                        <span className="clip-skel-avatar" />
                        <span className="clip-skel-line" style={{ width: "38%" }} />
                      </div>
                      <div className="clip-skel-media" />
                      <div className="clip-skel-body">
                        <span className="clip-skel-line" style={{ width: "76%" }} />
                        <span className="clip-skel-line" style={{ width: "52%" }} />
                      </div>
                    </article>
                  ))}
                </div>
              ) : clips.length === 0 ? (
                <div className="empty-hint">
                  <p style={{ margin: 0 }}>
                    {search
                      ? `Nothing matches "${search}".`
                      : `Nothing here${range === "all" ? " yet" : " in this window"}.`}
                  </p>
                  {range !== "all" && (
                    <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => setRange("all")}>
                      {t("auto.feedclient.show_all_time")}
                                                                  </button>
                  )}
                </div>
              ) : (
                <div className="feed-grid">
                  {clips.map((c) => (
                    <ClipCard
                      key={c.id}
                      clip={c}
                      signedIn={signedIn}
                      isAdmin={isAdmin}
                      onChanged={loadClips}
                      autoOpen={c.id === openClipId}
                    />
                  ))}
                </div>
              )}
            </>
          ) : updates === null ? (
            <p className="muted">{t("auto.feedclient.loading_updates")}</p>
          ) : updates.length === 0 ? (
            <p className="empty-hint">{t("auto.feedclient.steam_rsquo_s_news_feed_is_not")}</p>
          ) : (
            <ul className="feed-updates">
              {updates.map((u) => (
                <li key={u.id}>
                  <a href={u.url} target="_blank" rel="noreferrer noopener">
                    <span className="feed-update-date num">
                      {new Date(u.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <span className="feed-update-title">{u.title}</span>
                    <span className="feed-update-summary">{u.summary}</span>
                    <span className="feed-update-source">{u.source} ↗</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {uploading && (
        <UploadClipModal
          onClose={() => setUploading(false)}
          onPosted={() => {
            setUploading(false);
            setRange("all");
            setSort("new");
            loadClips();
          }}
        />
      )}
    </>
  );
}
