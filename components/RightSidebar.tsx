import Link from "next/link";

type AvatarPlayer = {
  steamId: string;
  name: string;
  avatarSrc: string;
};

export default function RightSidebar({ players }: { players: AvatarPlayer[] }) {
  if (players.length === 0) return null;

  return (
    <aside className="right-sidebar">
      {players.map((p) => (
        <Link key={p.steamId} href={`/players/${p.steamId}`} title={p.name} className="rs-avatar-link">
          <img src={p.avatarSrc} alt={p.name} />
        </Link>
      ))}
    </aside>
  );
}
