"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import MapPicker from "@/components/admin/MapPicker";
import "./maker.css";

// The Maker tool.
//
// Deliberately not a map editor. Placing a spawn accurately means standing in
// it, so this owns the part a browser is better at — what positions should
// exist, what each is called, which role it serves — and hands the placing to
// the game. The variant rows fill in live as they are dropped.

type MapRow = {
  id: number;
  mapName: string;
  displayName: string;
  imageUrl: string | null;
  ready: boolean;
  /** How much is already authored — the reason to pick one map over another. */
  spawns: number;
  variants: number;
};

type Variant = {
  id: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  setpos: string;
  viewpos: string;
};

type Spawn = {
  id: number;
  name: string;
  role: string;
  bombsite: number;
  team: number;
  canBePlanter: boolean;
  variants: Variant[];
};

const CT_ROLES = ["frontrunner", "backup", "roamer", "awper"];
const T_ROLES = ["planter", "rifler", "sniper"];

/** Matches the marker colours in game, so a role reads the same in both places. */
const ROLE_COLOUR: Record<string, string> = {
  frontrunner: "#ff3b30",
  backup: "#3b82f6",
  roamer: "#22d3ee",
  awper: "#a78bfa",
  planter: "#f59e0b",
  sniper: "#ec4899",
  rifler: "#4ade80",
};

/** The four lists a map is authored in: each site, each side. */
const SECTIONS = [
  { bombsite: 0, team: 3, key: "a-ct" },
  { bombsite: 0, team: 2, key: "a-t" },
  { bombsite: 1, team: 3, key: "b-ct" },
  { bombsite: 1, team: 2, key: "b-t" },
] as const;

export default function MakerTool({
  adminKey,
  maps,
}: {
  adminKey?: string;
  maps: MapRow[];
}) {
  const { t } = useI18n();

  const [map, setMap] = useState<string | null>(null);
  const [spawns, setSpawns] = useState<Spawn[]>([]);
  const [activeSpawnId, setActiveSpawnId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [draft, setDraft] = useState({ name: "", role: "backup", bombsite: 0, team: 3, planter: false });

  const load = useCallback(async () => {
    if (!map) return;

    const params = new URLSearchParams({ map });
    if (adminKey) params.set("key", adminKey);

    try {
      const res = await fetch(`/api/admin/maker/spawns?${params}`, { cache: "no-store" });
      if (!res.ok) return;

      const data = await res.json();
      setSpawns(data.spawns ?? []);
      setActiveSpawnId(data.activeSpawnId ?? null);
    } catch {
      // A failed poll is a stale list, not a broken page — the next one fixes it.
    }
  }, [map, adminKey]);

  // Polled rather than pushed. The plugin already posts every placement to the
  // server, so this only has to be fresher than a person can walk to the next
  // position — two seconds is comfortably that, and it costs one small query.
  useEffect(() => {
    if (!map) return;

    load();
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [map, load]);

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setNotice(null);

      try {
        const res = await fetch("/api/admin/maker", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...body, key: adminKey }),
        });

        const data = await res.json();

        if (!res.ok || data.ok === false) {
          setNotice(data.error ?? data.reply ?? t("maker.failed"));
        } else if (data.reply) {
          setNotice(data.reply);
        }

        await load();
        return Boolean(data.ok);
      } catch (err) {
        setNotice(String(err));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [adminKey, load, t],
  );

  /**
   * Removing a spawn. The endpoint existed and nothing called it, so a spawn
   * created by a typo was permanent — and the unique key is (map, site, side,
   * name), which means the same typo could not be corrected by re-creating it
   * either.
   */
  const remove = useCallback(
    async (spawn: Spawn) => {
      const params = new URLSearchParams({ id: String(spawn.id) });
      if (adminKey) params.set("key", adminKey);

      setBusy(true);
      try {
        const res = await fetch(`/api/admin/maker/spawns?${params}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok || data.ok === false) setNotice(data.error ?? t("maker.failed"));
        await load();
      } catch (err) {
        setNotice(String(err));
      } finally {
        setBusy(false);
      }
    },
    [adminKey, load, t],
  );

  const roles = draft.team === 2 ? T_ROLES : CT_ROLES;

  // A role from the other side stays selected when the side is switched, which
  // the server would reject — so it is corrected here rather than at submit.
  useEffect(() => {
    if (!roles.includes(draft.role)) {
      setDraft((d) => ({ ...d, role: roles[0] }));
    }
  }, [draft.team, draft.role, roles]);

  const grouped = useMemo(() => {
    const out: Record<string, Spawn[]> = {};
    for (const section of SECTIONS) {
      out[section.key] = spawns.filter(
        (s) => s.bombsite === section.bombsite && s.team === section.team,
      );
    }
    return out;
  }, [spawns]);

  if (!map) {
    // The same picker the Game Maker uses, so choosing a map is one gesture
    // across both tools. What differs is the note under each name: here it is
    // how much has been authored, which is what decides where to start.
    return (
      <MapPicker
        maps={maps.map((m) => ({
          name: m.mapName,
          label: m.displayName,
          image: m.imageUrl,
          ready: m.ready,
          note:
            m.spawns === 0
              ? t("maker.nothingAuthored")
              : t("maker.authored", { spawns: String(m.spawns), variants: String(m.variants) }),
        }))}
        value=""
        onChange={setMap}
        emptyHint={t("maker.noMaps")}
      />
    );
  }

  return (
    <div className="mk">
      <div className="mk-bar">
        <button className="btn" onClick={() => setMap(null)}>
          ← {t("maker.allMaps")}
        </button>
        <strong>{map}</strong>
        {activeSpawnId !== null && (
          <span className="mk-live">{t("maker.sessionOpen")}</span>
        )}
        <button
          className="btn"
          disabled={busy || activeSpawnId === null}
          onClick={() => post({ action: "generate" })}
        >
          {t("maker.generate")}
        </button>
        <button
          className="btn"
          disabled={busy || activeSpawnId === null}
          onClick={() => post({ action: "end" })}
        >
          {t("maker.discard")}
        </button>
      </div>

      {notice && <p className="mk-notice">{notice}</p>}

      <form
        className="mk-new"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.name.trim()) return;

          const ok = await post({
            map,
            name: draft.name.trim(),
            role: draft.role,
            bombsite: draft.bombsite,
            team: draft.team,
            canBePlanter: draft.planter,
          });

          if (ok) setDraft((d) => ({ ...d, name: "" }));
        }}
      >
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder={t("maker.namePlaceholder")}
          maxLength={64}
        />

        <select value={draft.bombsite} onChange={(e) => setDraft({ ...draft, bombsite: Number(e.target.value) })}>
          <option value={0}>{t("maker.siteA")}</option>
          <option value={1}>{t("maker.siteB")}</option>
        </select>

        <select value={draft.team} onChange={(e) => setDraft({ ...draft, team: Number(e.target.value) })}>
          <option value={3}>CT</option>
          <option value={2}>T</option>
        </select>

        <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
          {roles.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        {draft.team === 2 && (
          <label className="mk-check">
            <input
              type="checkbox"
              checked={draft.planter}
              onChange={(e) => setDraft({ ...draft, planter: e.target.checked })}
            />
            {t("maker.plantSpot")}
          </label>
        )}

        <button className="btn btn-primary" disabled={busy || !draft.name.trim()}>
          {t("maker.selectInGame")}
        </button>
      </form>

      <div className="mk-sections">
        {SECTIONS.map((section) => (
          <div key={section.key} className="mk-section">
            <h3>
              {section.bombsite === 0 ? t("maker.siteA") : t("maker.siteB")}
              {" · "}
              {section.team === 2 ? "T" : "CT"}
              {/* The count says whether this quarter of the map is done, which
                  is the thing you are actually tracking while authoring. */}
              <span className="mk-section-n">
                {grouped[section.key].length}
                {" / "}
                {grouped[section.key].reduce((n, s) => n + s.variants.length, 0)}
              </span>
            </h3>

            {grouped[section.key].length === 0 && (
              <p className="muted mk-empty">{t("maker.nothingHere")}</p>
            )}

            {grouped[section.key].map((spawn) => (
              <div
                key={spawn.id}
                className={`mk-spawn ${spawn.id === activeSpawnId ? "active" : ""}`}
              >
                <div className="mk-spawn-head">
                  <span className="mk-dot" style={{ background: ROLE_COLOUR[spawn.role] ?? "#888" }} />
                  <strong>{spawn.name}</strong>
                  <span className="muted">{spawn.role}</span>
                  {spawn.canBePlanter && <span className="mk-tag">{t("maker.plantSpot")}</span>}
                  <span className="mk-count">
                    {t("maker.variantCount", { n: String(spawn.variants.length) })}
                  </span>

                  <button
                    className="btn mk-small"
                    disabled={busy}
                    onClick={() =>
                      post({
                        map,
                        name: spawn.name,
                        role: spawn.role,
                        bombsite: spawn.bombsite,
                        team: spawn.team,
                        canBePlanter: spawn.canBePlanter,
                      })
                    }
                  >
                    {t("maker.selectInGame")}
                  </button>

                  <button
                    className="btn mk-small mk-danger"
                    disabled={busy}
                    title={t("maker.deleteSpawn")}
                    aria-label={`${t("maker.deleteSpawn")}: ${spawn.name}`}
                    onClick={() => remove(spawn)}
                  >
                    ×
                  </button>
                </div>

                {spawn.variants.length > 0 && (
                  <ol className="mk-variants">
                    {spawn.variants.map((v) => (
                      <li key={v.id}>
                        <code>{v.setpos}</code>
                        <code className="muted">{v.viewpos}</code>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
