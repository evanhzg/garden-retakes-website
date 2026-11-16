"use client";

import { useI18n } from "@/components/I18nProvider";
import { TOWER_MAPS, type MapPoint } from "@/lib/tournament/towerRound";

/**
 * Where a role starts, on the whole of Dust II.
 *
 * The role card's "Spawn" line says it in words ("nearest the tower", "forward,
 * hidden"); this says it on the map, from the spawns the server actually uses for
 * tower rounds — around every place the tower can stand (the bomb sites and the field
 * spots), so the pattern shows rather than one example. The other roles' spawns stay
 * as faint dots so the highlighted ones read as a choice among them, and the tower
 * spots mark what everybody runs at.
 */

const MAP = TOWER_MAPS.de_dust2;

export default function RoleSpawnMap({ roleId, side }: { roleId: string; side: "ct" | "t" }) {
  const { t } = useI18n();
  const [x, y, w, h] = MAP.bounds;
  const k = w / 200;

  const mine: MapPoint[] = [];
  const rest: { p: MapPoint; side: "t" | "ct" }[] = [];
  for (const z of MAP.zones) {
    for (const [group, sd] of [["t", "t"], ["ct", "ct"], ["roamer", "ct"]] as const) {
      for (const p of z[group]) {
        if (p.role === roleId) mine.push(p);
        else rest.push({ p, side: sd });
      }
    }
  }

  return (
    <figure className="th-rolemap">
      <svg viewBox={`${x} ${y} ${w} ${h}`} role="img" aria-label={t("home.roles.where", { role: t(`role.${roleId}.name`) })}>
        <path className="twr-floor" d={MAP.floor} fillRule="evenodd" />
        <path className="twr-walls" d={MAP.floor} fillRule="evenodd" />

        {MAP.zones.map((z) => {
          const cx = z.spots.reduce((a, p) => a + p.x, 0) / z.spots.length;
          const cy = z.spots.reduce((a, p) => a + p.y, 0) / z.spots.length;
          return (
            <g key={z.zone}>
              {z.spots.map((p) => (
                <rect
                  key={p.name}
                  className="twr-spot"
                  x={p.x - 2.6 * k}
                  y={p.y - 2.6 * k}
                  width={5.2 * k}
                  height={5.2 * k}
                  transform={`rotate(45 ${p.x} ${p.y})`}
                />
              ))}
              {z.kind === "site" && (
                <text className="th-rolemap-site" x={cx} y={cy - 9 * k} fontSize={14 * k}>
                  {z.name.slice(0, 1)}
                </text>
              )}
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
