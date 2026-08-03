"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from '@/components/I18nProvider';
import { DEMO_EXTENSIONS, isDemoFile } from "@/lib/feedShared";

// Upload a demo for the highlight pipeline to cut.
//
// The file goes straight from the browser to R2 with a presigned URL — it never
// passes through the site, because Vercel caps a request body at 4.5 MB and a
// demo is 100-300 MB. The API only ever sees the metadata.
//
// Three steps, all hidden behind one button: create the row and get a signed
// URL, PUT the file with progress, then mark it pending so the pipeline
// collects it.

type Submission = {
  id: number;
  fileName: string;
  rounds: string | null;
  focusSteamId: string | null;
  status: string;
  note: string | null;
  clipCount: number;
  bytes: number | null;
  createdAt: string;
};

const MAX_MB = 500;

const STATUS_LABEL: Record<string, string> = {
  uploading: "Upload interrupted",
  pending: "Waiting to be cut",
  processing: "Being cut now",
  done: "Clips published",
  failed: "Failed",
};

const mb = (b: number | null) => (b ? `${(b / 1024 / 1024).toFixed(0)} MB` : "");

const DISMISSED_KEY = "garden_dismissed_demos";

/** Matches the collapse in globals.css; the card has to still be on screen
 *  while it plays, so the two numbers have to agree. */
const LEAVE_MS = 180;

/** The list is only ever this person's own uploads, but nothing prunes it when
 *  a demo ages out of the API, so it is capped rather than left to grow for the
 *  life of the browser profile. */
const DISMISSED_MAX = 200;

/** Mirrors the CSS: the footer toggle wins, and the OS setting decides when it
 *  is on "system". Without this the card would sit there for 180ms doing
 *  nothing at all for someone who asked for less motion. */
const motionOk = () => {
  const pref = document.documentElement.getAttribute("data-motion");
  if (pref === "off") return false;
  if (pref === "full") return true;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

const readDismissed = (): number[] => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((v): v is number => typeof v === "number") : [];
  } catch {
    // Unparseable or unavailable storage means nothing was ever hidden, which
    // is the safe reading: it shows a card too many, never one too few.
    return [];
  }
};

export default function DemoUpload({ onPosted }: { onPosted?: () => void }) {
    const { t } = useI18n();

  const [file, setFile] = useState<File | null>(null);
  const [rounds, setRounds] = useState("");
  const [focus, setFocus] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [mine, setMine] = useState<Submission[] | null>(null);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const [leaving, setLeaving] = useState<number[]>([]);
  const [restored, setRestored] = useState(false);
  const timers = useRef<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadMine = async () => {
    try {
      const res = await fetch("/api/feed/demos", { cache: "no-store" });
      if (res.ok) setMine((await res.json()).demos ?? []);
    } catch {
      /* the list is a nicety, not the point */
    }
  };

  useEffect(() => {
    loadMine();
  }, []);

  // Read on mount rather than in the initial state: this component is rendered
  // on the server too, and a first paint that already knew what was hidden
  // would not match the one React makes here.
  useEffect(() => {
    setDismissed(readDismissed());
    setRestored(true);
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  useEffect(() => {
    // Guarded on the restore so the empty state this starts in is never written
    // over what a previous visit stored.
    if (!restored) return;
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
    } catch {
      // Private mode — the cards simply come back on the next reload.
    }
  }, [dismissed, restored]);

  /** Takes the card off this list and nothing else. The demo, its clips and its
   *  row are untouched: the list is a progress readout, and once it has been
   *  read there is nothing left for the card to say. */
  const dismiss = (id: number) => {
    if (leaving.includes(id)) return;
    setLeaving((cur) => [...cur, id]);
    const commit = () => {
      setDismissed((cur) => (cur.includes(id) ? cur : [...cur, id].slice(-DISMISSED_MAX)));
      setLeaving((cur) => cur.filter((v) => v !== id));
    };
    timers.current.push(window.setTimeout(commit, motionOk() ? LEAVE_MS : 0));
  };

  // A card on its way out is still on screen, so it stays in this list until
  // its collapse has finished.
  const visible = (mine ?? []).filter((d) => !dismissed.includes(d.id));

  const choose = (f: File | null) => {
    if (!f) return;
    if (!isDemoFile(f.name)) return setError(`Not a demo file. Accepted: ${DEMO_EXTENSIONS.join(", ")}.`);
    if (f.size > MAX_MB * 1024 * 1024) {
      return setError(`${(f.size / 1024 / 1024).toFixed(0)} MB is over the ${MAX_MB} MB limit.`);
    }
    setError(null);
    setOk(null);
    setFile(f);
  };

  /** XHR rather than fetch: it is still the only way to get upload progress. */
  const put = (url: string, body: File) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`R2 returned ${xhr.status}`)));
      xhr.onerror = () => reject(new Error("network error during upload"));
      xhr.send(body);
    });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || progress !== null) return;
    setError(null);
    setOk(null);
    setProgress(0);
    try {
      const start = await fetch("/api/feed/demos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: file.name, bytes: file.size, rounds, focusSteamId: focus }),
      });
      const started = await start.json();
      if (!start.ok) throw new Error(started.error ?? "Could not start the upload.");

      await put(started.uploadUrl, file);
      await fetch(`/api/feed/demos/${started.id}/complete`, { method: "POST" });

      setOk("Uploaded. It will be cut on the next pipeline run.");
      setFile(null);
      setRounds("");
      setFocus("");
      if (inputRef.current) inputRef.current.value = "";
      await loadMine();
      onPosted?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="demo-upload">
      <form onSubmit={submit} className="clip-form">
        <label
          className={`skin-drop${dragging ? " is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            choose(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept={DEMO_EXTENSIONS.join(",")}
            onChange={(e) => {
              choose(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <span className="skin-drop-title">{file ? file.name : "Drop a demo here, or choose a file"}</span>
          <span className="skin-drop-hint">
            {file
              ? `${mb(file.size)} - ready`
              : `.dem, or zipped / .gz / .bz2 / .zst - up to ${MAX_MB} MB. Compressed uploads faster.`}
          </span>
        </label>

        <div className="demo-fields">
          <div className="field">
            <label htmlFor="demo-rounds">{t("auto.demoupload.rounds")} <span className="muted">{t("auto.demoupload._optional")}</span></label>
            <input
              id="demo-rounds"
              className="input"
              value={rounds}
              placeholder={t("auto.demoupload.e_g_5_12_19")}
              onChange={(e) => setRounds(e.target.value)}
            />
            <p className="pro-settings-hint">{t("auto.demoupload.only_these_rounds_get_cut_leav")}</p>
          </div>

          <div className="field">
            <label htmlFor="demo-focus">{t("auto.demoupload.player")} <span className="muted">{t("auto.demoupload._optional")}</span></label>
            <input
              id="demo-focus"
              className="input"
              value={focus}
              placeholder={t("auto.demoupload.steamid64")}
              onChange={(e) => setFocus(e.target.value)}
            />
            <p className="pro-settings-hint">{t("auto.demoupload.only_their_plays_get_cut_leave")}</p>
          </div>
        </div>

        {progress !== null && (
          <div className="demo-progress">
            <div className="pro-meter-track">
              <div className="pro-meter-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="num">{progress}%</span>
          </div>
        )}

        <div aria-live="assertive" role="alert">
          {error && <p className="skin-note skin-note-error"><span>{error}</span></p>}
        </div>
        <div aria-live="polite">
          {ok && <p className="skin-note skin-note-ok"><span>{ok}</span></p>}
        </div>

        <div className="clip-form-actions">
          <button className="btn btn-primary" type="submit" disabled={!file || progress !== null}>
            {progress !== null ? `Uploading ${progress}%` : "Upload demo"}
          </button>
        </div>
      </form>

      {visible.length > 0 && (
        <div className="demo-mine">
          <h3 className="fc-sub">{t("auto.demoupload.your_demos")}</h3>
          <ul>
            {visible.map((d) => (
              <li key={d.id} className={leaving.includes(d.id) ? "is-leaving" : undefined}>
                <div className="demo-mine-card">
                  <span className="demo-mine-name">{d.fileName}</span>
                  <span className={`tag ${d.status === "done" ? "tag-accent" : "tag-neutral"}`}>
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                  <button
                    type="button"
                    className="demo-mine-x"
                    onClick={() => dismiss(d.id)}
                    title="Hide from this list"
                    aria-label={`Hide ${d.fileName} from this list`}
                  >
                    ×
                  </button>
                  <span className="demo-mine-meta">
                    {mb(d.bytes)}
                    {d.rounds ? ` · rounds ${d.rounds}` : ""}
                    {d.status === "done" ? ` · ${d.clipCount} clip${d.clipCount === 1 ? "" : "s"}` : ""}
                    {d.note ? ` · ${d.note}` : ""}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
