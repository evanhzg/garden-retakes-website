"use client";

/**
 * The layout itself threw — the database the layout reads on every request is
 * the usual cause. Nothing above this exists: no stylesheet, no providers, no
 * translations. So it is self-contained, inline-styled on the site's dark
 * ground, and says the one useful thing in both languages.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#100f0e",
          color: "#f3f2f2",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
        }}
      >
        <main style={{ maxWidth: 520 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#ff4a28" }}>
            REEEETAKES
          </div>
          <h1 style={{ fontSize: 34, margin: "10px 0 8px" }}>The site is having a moment.</h1>
          <p style={{ margin: "0 0 4px", opacity: 0.75 }}>
            Something underneath every page failed — usually the database for a few seconds. Try again.
          </p>
          <p style={{ margin: "0 0 20px", opacity: 0.55, fontStyle: "italic" }}>
            Le site rencontre un souci passager. Réessaie dans un instant.
          </p>
          <button
            onClick={() => reset()}
            style={{
              font: "inherit",
              fontWeight: 800,
              padding: "10px 18px",
              background: "#ff4a28",
              color: "#100f0e",
              border: 0,
              cursor: "pointer",
            }}
          >
            Try again · Réessayer
          </button>
          {error.digest && (
            <p style={{ marginTop: 18, fontSize: 12, opacity: 0.5, fontFamily: "ui-monospace, monospace" }}>ref {error.digest}</p>
          )}
        </main>
      </body>
    </html>
  );
}
