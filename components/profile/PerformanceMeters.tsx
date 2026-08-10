type Meter = {
  label: string;
  value: number;
  display: string;
};

/**
 * Legacy player/pro profile performance block. Its class names deliberately
 * remain intact: the component removes duplicated rendering logic without
 * changing the established panel geometry or visual treatment.
 */
export default function PerformanceMeters({
  meters,
  recentRatings,
  ratingHistoryLabel,
}: {
  meters: Meter[];
  recentRatings: number[];
  ratingHistoryLabel: string;
}) {
  const maxRecent = Math.max(1.5, ...recentRatings);

  return (
    <>
      <div style={{ marginTop: 18 }}>
        {meters.map((meter) => (
          <div key={meter.label} className="meter">
            <span className="cap">{meter.label}</span>
            <div className="track">
              <div className="fill" style={{ width: `${Math.min(100, meter.value)}%` }} />
            </div>
            <span className="val">{meter.display}</span>
          </div>
        ))}
      </div>

      {recentRatings.length > 1 && (
        <div style={{ marginTop: 16 }}>
          <div className="cap muted" style={{ fontSize: "0.78rem", fontWeight: 700, marginBottom: 6 }}>
            {ratingHistoryLabel}
          </div>
          <div className="sparkline">
            {recentRatings.map((rating, index) => (
              <span
                key={index}
                title={rating.toFixed(2)}
                style={{
                  height: `${Math.max(6, (rating / maxRecent) * 100)}%`,
                  animationDelay: `${index * 0.015}s`,
                  opacity: rating >= 1 ? 1 : 0.45,
                }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
