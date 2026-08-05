"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { useSocket } from "@/components/games/SocketProvider";
import {
  CLICK_HINT,
  CLICK_LABEL,
  PURPOSE_LABEL,
  TEAM_LABEL,
  THROW_LABEL,
  UTIL_COLOUR,
  setposFor,
  type Lineup,
} from "@/lib/utilityShared";

// One lineup, in full.
//
// The order is the order someone uses it in: what it is, what it looks like,
// where to stand, then the buttons that put you there. The pictures come before
// the numbers because the numbers are only useful to a machine — nobody has
// ever aimed a smoke by reading a pitch value.

type Shot = { key: "aim" | "stand" | "result"; label: string; src: string };

type Props = {
  lineup: Lineup;
  signedIn: boolean;
  favourite: boolean;
  testing: boolean;
  onBack: () => void;
  onTest: (l: Lineup) => void;
  onToggleFavourite: (id: number) => void;
  onNote: (note: { kind: "ok" | "err"; text: string }) => void;
  onUpdate?: (updated: Lineup) => void;
};

export default function UtilityDetail({
  lineup,
  signedIn,
  favourite,
  testing,
  onBack,
  onTest,
  onToggleFavourite,
  onNote,
  onUpdate,
}: Props) {
  const { t } = useI18n();
  const { socket, isAuthed } = useSocket();
  const [shotKey, setShotKey] = useState<Shot["key"]>("aim");
  const [lightbox, setLightbox] = useState(false);
  
  const [capturing, setCapturing] = useState(false);
  const [capturePreview, setCapturePreview] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestSetpos, setSuggestSetpos] = useState("");
  const [suggestNotes, setSuggestNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const shots = useMemo<Shot[]>(() => {
    const out: Shot[] = [];
    // Aim first: it is the one people copy. The stand shot only says which
    // corner to walk to, and the result only confirms it worked.
    if (lineup.shots.aim) out.push({ key: "aim", label: t("utility.shot.aim"), src: lineup.shots.aim });
    if (lineup.shots.stand) out.push({ key: "stand", label: t("utility.shot.stand"), src: lineup.shots.stand });
    if (lineup.shots.result) out.push({ key: "result", label: t("utility.shot.result"), src: lineup.shots.result });
    return out;
  }, [lineup, t]);

  useEffect(() => {
    setShotKey(shots[0]?.key ?? "aim");
    setLightbox(false);
  }, [lineup.id, shots]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLightbox(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  useEffect(() => {
    if (!socket) return;
    const onPreview = (data: { url: string }) => {
      setCapturePreview(data.url);
      setCapturing(false);
    };
    socket.on("capture_preview", onPreview);
    return () => {
      socket.off("capture_preview", onPreview);
    };
  }, [socket]);

  const shot = shots.find((s) => s.key === shotKey) ?? shots[0] ?? null;
  const setpos = setposFor(lineup);

  const copy = (text: string, ok: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => onNote({ kind: "ok", text: ok }))
      .catch(() => onNote({ kind: "err", text: t("utility.copyfailed") }));
  };

  const handleCaptureRequest = () => {
    if (!socket || !isAuthed) return;
    setCapturing(true);
    socket.emit("capture_request", {
      lineupId: lineup.id,
      map: lineup.map,
      setpos: `setpos ${lineup.stand.x} ${lineup.stand.y} ${lineup.stand.z}; setang ${lineup.view.pitch} ${lineup.view.yaw}`
    });
  };

  const handleAcceptCapture = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/lineups/${lineup.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shotType: shotKey, url: capturePreview })
      });
      if (!res.ok) throw new Error("Save failed");
      const json = await res.json();
      onNote({ kind: "ok", text: t("common.saved") });
      setCapturePreview(null);
      if (onUpdate && json.lineup) {
        const r = json.lineup;
        onUpdate({
          id: r.Id,
          map: r.Map,
          name: r.Name,
          area: r.Area,
          utility: r.Utility,
          purpose: r.Purpose,
          team: r.Team,
          throwType: r.ThrowType,
          clickType: r.ClickType,
          stand: { x: r.StandX, y: r.StandY, z: r.StandZ },
          view: { pitch: r.Pitch, yaw: r.Yaw },
          land: r.LandX !== null && r.LandY !== null ? { x: r.LandX, y: r.LandY, z: r.LandZ ?? 0 } : null,
          notes: r.Notes,
          clipUrl: r.ClipUrl,
          thumb: r.Thumb,
          shots: { stand: r.ShotStand, aim: r.ShotAim, result: r.ShotResult },
          verified: r.Verified,
          source: r.Source,
        });
      }
    } catch {
      onNote({ kind: "err", text: t("common.networkError") || "Failed to save" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await fetch(`/api/admin/capture-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineupId: lineup.id,
          setpos: suggestSetpos,
          notes: suggestNotes
        })
      });
      onNote({ kind: "ok", text: t("common.saved") });
    } catch {
      onNote({ kind: "err", text: t("common.networkError") });
    }
    setSubmitting(false);
    setSuggesting(false);
    setCapturePreview(null);
  };

  return (
    <div className="util-detail">
      <button className="btn btn-ghost util-back" onClick={onBack}>
        {t("utility.backtolist")}
      </button>

      <div className="util-detail-head">
        <h2>{lineup.name}</h2>
        <button
          className={`util-fav ${favourite ? "on" : ""}`}
          onClick={() => onToggleFavourite(lineup.id)}
          aria-pressed={favourite}
          title={favourite ? t("utility.unfavourite") : t("utility.favourite")}
        >
          {favourite ? "★" : "☆"}
        </button>
      </div>

      <p className="util-tags">
        <span className="util-chip" style={{ ["--tint" as string]: UTIL_COLOUR[lineup.utility] }}>
          {t(`utility.type.${lineup.utility}`)}
        </span>
        {lineup.area && <span className="util-chip neutral">{lineup.area}</span>}
        {lineup.team && <span className="util-chip neutral">{TEAM_LABEL[lineup.team] ?? lineup.team}</span>}
        {lineup.purpose && lineup.purpose !== "default" && (
          <span className="util-chip neutral">{PURPOSE_LABEL[lineup.purpose] ?? lineup.purpose}</span>
        )}
        {!lineup.verified && <span className="util-chip warn">{t("utility.unverified")}</span>}
      </p>

      {shot ? (
        <figure className="util-shots">
          {shots.length > 1 && (
            <div className="util-shottabs" role="tablist">
              {shots.map((s) => (
                <button
                  key={s.key}
                  role="tab"
                  aria-selected={s.key === shotKey}
                  className={`util-shottab ${s.key === shotKey ? "on" : ""}`}
                  onClick={() => setShotKey(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <button className="util-shotframe" onClick={() => setLightbox(true)} title={t("utility.enlarge")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shot.src} alt={`${lineup.name} — ${shot.label}`} loading="lazy" />
            <span className="util-shotzoom" aria-hidden>⤢</span>
          </button>
        </figure>
      ) : (
        <p className="util-noshot">{t("utility.noshots")}</p>
      )}

      {lineup.clipUrl && (
        <video className="util-clip" src={lineup.clipUrl} poster={lineup.thumb ?? undefined} muted loop playsInline controls />
      )}

      <dl className="util-facts">
        <div>
          <dt>{t("utility.fact.movement")}</dt>
          <dd>{THROW_LABEL[lineup.throwType] ?? lineup.throwType}</dd>
        </div>
        <div>
          <dt>{t("utility.fact.button")}</dt>
          <dd>
            {CLICK_LABEL[lineup.clickType] ?? lineup.clickType}
            {CLICK_HINT[lineup.clickType] && <span className="muted"> — {CLICK_HINT[lineup.clickType]}</span>}
          </dd>
        </div>
        <div>
          <dt>{t("utility.fact.standat")}</dt>
          <dd className="num">
            {lineup.stand.x.toFixed(1)} {lineup.stand.y.toFixed(1)} {lineup.stand.z.toFixed(1)}
          </dd>
        </div>
        <div>
          <dt>{t("utility.fact.look")}</dt>
          <dd className="num">
            {lineup.view.pitch.toFixed(3)} / {lineup.view.yaw.toFixed(3)}
          </dd>
        </div>
        {lineup.land && (
          <div>
            <dt>{t("utility.fact.landsat")}</dt>
            <dd className="num">
              {lineup.land.x.toFixed(1)} {lineup.land.y.toFixed(1)}
            </dd>
          </div>
        )}
      </dl>

      {lineup.notes && <p className="util-notes">{lineup.notes}</p>}

      {!lineup.verified && (
        <p className="skin-note skin-note-error">
          <span>{t("utility.unverifiedwarning")}</span>
        </p>
      )}

      <div className="util-actions">
        {signedIn ? (
          <button className="btn btn-primary" onClick={() => onTest(lineup)} disabled={testing}>
            {testing ? t("utility.settingup") : t("utility.testingame")}
          </button>
        ) : (
          <a className="btn btn-secondary" href="/api/auth/steam/login">
            {t("utility.signintotest")}
          </a>
        )}
        <button className="btn btn-secondary" onClick={() => copy(setpos, t("utility.setposcopied"))}>
          {t("utility.copysetpos")}
        </button>
        <button
          className="btn btn-secondary"
          onClick={() =>
            copy(`${window.location.origin}/utility?map=${lineup.map}&lineup=${lineup.id}`, t("utility.linkcopied"))
          }
        >
          {t("utility.copylink")}
        </button>
        {signedIn && (
          <button 
            className="btn btn-secondary" 
            onClick={handleCaptureRequest} 
            disabled={capturing || !isAuthed}
          >
            {capturing ? t("utility.capturing") : t("utility.updateScreenshot")}
          </button>
        )}
      </div>

      <code className="util-setpos">{setpos}</code>

      {lightbox && shot && (
        <div className="util-lightbox" role="dialog" aria-modal="true" onClick={() => setLightbox(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shot.src} alt={`${lineup.name} — ${shot.label}`} onClick={(e) => e.stopPropagation()} />
          <div className="util-lightbox-bar" onClick={(e) => e.stopPropagation()}>
            {shots.map((s) => (
              <button
                key={s.key}
                className={`util-shottab ${s.key === shotKey ? "on" : ""}`}
                onClick={() => setShotKey(s.key)}
              >
                {s.label}
              </button>
            ))}
            <button className="util-shottab" onClick={() => setLightbox(false)}>
              {t("utility.close")}
            </button>
          </div>
        </div>
      )}

      {capturePreview && (
        <div className="util-lightbox" role="dialog" aria-modal="true" onClick={() => setCapturePreview(null)}>
          <div className="util-capture-modal" onClick={e => e.stopPropagation()} style={{ background: "var(--bg)", padding: 24, borderRadius: 8, maxWidth: 600, width: "100%", margin: "auto", position: "relative", zIndex: 10 }}>
            <h3 style={{ marginTop: 0 }}>{t("utility.capturePreview")}</h3>
            {!suggesting ? (
              <>
                <img src={capturePreview} alt="Preview" style={{ width: "100%", borderRadius: 8, marginBottom: 16 }} />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button className="btn btn-secondary" onClick={() => setSuggesting(true)}>{t("utility.suggestModifications")}</button>
                  <button className="btn btn-primary" onClick={handleAcceptCapture} disabled={submitting}>{submitting ? t("common.saving") : t("utility.accept")}</button>
                </div>
              </>
            ) : (
              <form onSubmit={handleSubmitSuggestion}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", marginBottom: 8 }}>{t("utility.newSetpos")}</label>
                  <input type="text" className="input" style={{ width: "100%" }} value={suggestSetpos} onChange={e => setSuggestSetpos(e.target.value)} required />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", marginBottom: 8 }}>{t("utility.notes")}</label>
                  <textarea className="input" style={{ width: "100%", minHeight: 80 }} value={suggestNotes} onChange={e => setSuggestNotes(e.target.value)} required />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setSuggesting(false)}>{t("common.cancel")}</button>
                  <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? t("utility.submitting") : t("utility.submitSuggestion")}</button>
                </div>
              </form>
            )}
            <button className="btn btn-ghost" style={{ position: "absolute", top: 16, right: 16 }} onClick={() => setCapturePreview(null)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
