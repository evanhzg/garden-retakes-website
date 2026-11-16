"use client";

import { useI18n } from "@/components/I18nProvider";
import { TOWER_MAPS, type MapPoint } from "@/lib/tournament/towerRound";

/**
 * Where a role starts, on the whole of Dust II.
 *
 * The role card's "Spawn" line says it in words ("nearest the tower", "forward,
 * hidden"); this says it on the map, from the spawns the server actually uses for
 * tower rounds — both sites, so the pattern shows rather than one example. The
 * other roles' spawns stay as faint dots so the highlighted ones read as a choice
 * among them, and the tower spots (the plant spots) mark what everybody runs at.
 */

const MAP = TOWER_MAPS.de_dust2;

export default function RoleSpawnMap({ roleId, side }: { roleId: string; side: "ct" | "t" }) {
  const { t } = useI18n();
  const [x, y, w, h] = MAP.bounds;
  const k = w / 200;

  const mine: MapPoint[] = [];
  const rest: { p: MapPoint; side: "t" | "ct" }[] = [];
  for (const s of MAP.sites) {
    for (const [group, sd] of [["t", "t"], ["ct", "ct"], ["roamer", "ct"]] as const) {
      for (const p of s[group]) {
        if (p.role === roleId) mine.push(p);
        else rest.push({ p, side: sd });
      }
    }
  }

  return (
    <figure className="th-rolemap">
      <svg viewBox={`${x} ${y} ${w} ${h}`} role="img" aria-label={t("home.roles.where", { role: t(`role.${roleId}.name`) })}>
        <path className="tr-floor" d={MAP.floor} fillRule="evenodd" />
        <path className="tr-walls" d={MAP.floor} fillRule="evenodd" />

        {MAP.sites.map((s) => {
          const cx = s.spots.reduce((a, p) => a + p.x, 0) / s.spots.length;
          const cy = s.spots.reduce((a, p) => a + p.y, 0) / s.spots.length;
          return (
            <g key={s.site}>
              {s.spots.map((p) => (
                <rect
                  key={p.name}
                  className="tr-spot"
                  x={p.x - 2.6 * k}
                  y={p.y - 2.6 * k}
                  width={5.2 * k}
                  height={5.2 * k}
                  transform={`rotate(45 ${p.x} ${p.y})`}
                />
              ))}
              <text className="th-rolemap-site" x={cx} y={cy - 9 * k} fontSize={14 * k}>
                {s.site}
              </text>
            </g>
          );
        })}

        {rest.map(({ p, side: sd }, i) => (
          <circle key={i} className={`th-rolemap-other ${sd}`} cx={p.x} cy={p.y} r={2.2 * k} />
        ))}
        {mine.map((p, i) => (
          <circle key={`m${i}`} className={`th-rolemap-mine ${side}`} cx={p.x} cy={p.y} r={4.4 * k}>
            <title>{p.name}</title>
          </circle>
        ))}
      </svg>
      <figcaption>{t("home.roles.where", { role: t(`role.${roleId}.name`) })}</figcaption>
    </figure>
  );
}
