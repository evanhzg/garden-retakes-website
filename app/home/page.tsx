import React from 'react';
import { useSession } from 'next-auth/react';

export default function HomePage() {
  const session = useSession();

  return (
    <div className="home-page">
      <header>
        <h1>Welcome to Garden</h1>
        {session.status === "authenticated" && (
          <p>Logged in as {session.data.user.name}</p>
        )}
      </header>
      <main>
        {/* Content goes here */}
      </main>
    </div>
  );
}
