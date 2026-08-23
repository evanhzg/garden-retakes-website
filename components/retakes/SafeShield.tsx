"use client";

/**
 * The safe-queue standing of one player, as a shield beside their name.
 *
 * Lived inside RetakesLobby and was rendered from exactly one place, which is
 * why it was never seen anywhere else — the party seats want it too, and a
 * second copy of a colour ramp is how two screens end up disagreeing about
 * what "90" looks like.
 */
export default function SafeShield({ score, probation }: { score: number; probation: boolean }) {
  let color = "#888";
  if (probation) color = "#888";
  else if (score >= 90) color = "#FFD700";
  else if (score >= 60) color = "#4A90E2";
  else color = "#E0533A";

  return (
    <svg style={{ width: '14px', height: '14px', marginLeft: '6px', flexShrink: 0, verticalAlign: 'middle' }} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <title>{`Safe Score: ${probation ? 'Probation' : score}`}</title>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill={color} fillOpacity="0.2" />
    </svg>
  );
}
