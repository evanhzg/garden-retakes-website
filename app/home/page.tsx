import { getSession } from "@/lib/auth";

export default function HomePage() {
  const session = getSession();

  return (
    <div className="home-page">
      <header>
        <h1>Welcome to Garden</h1>
        {session && (
          <p>Logged in as {session.name ?? session.steamId}</p>
        )}
      </header>
      <main>
        {/* Content goes here */}
      </main>
    </div>
  );
}
