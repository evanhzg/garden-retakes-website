import Link from "next/link";

type Season = { Id: number; Name: string | null };

/**
 * The season and ranked-round query controls shared by own, player, and pro
 * profiles.  Keeping the query construction here prevents those three views
 * from drifting into subtly different filters while leaving each page in
 * charge of its surrounding heading and spacing.
 */
export default function SeasonFilters({
  seasons,
  seasonId,
  rankedOnly,
  rankedOnlyLabel,
  className = "chip-row",
  style,
}: {
  seasons: Season[];
  seasonId: number;
  rankedOnly: boolean;
  rankedOnlyLabel: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={className} style={style}>
      {seasons.map((season) => (
        <Link
          key={season.Id}
          className={`chip ${season.Id === seasonId ? "active" : ""}`}
          href={`?season=${season.Id}${rankedOnly ? "&ranked=1" : ""}`}
        >
          {season.Name}
        </Link>
      ))}
      <Link
        className={`chip ${rankedOnly ? "active" : ""}`}
        href={`?season=${seasonId}${rankedOnly ? "" : "&ranked=1"}`}
      >
        {rankedOnlyLabel}
      </Link>
    </div>
  );
}
