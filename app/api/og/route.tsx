import { ImageResponse } from "next/og";

export const runtime = "edge";

// Dynamic Open Graph card generator (Discord/Twitter link previews).
// DB-free by design: callers (generateMetadata) resolve data and pass it as
// query params, so this stays edge-compatible.
//
//   /api/og                                  → default site banner
//   /api/og?type=page&title=…&desc=…&icon=🎮 → generic page card
//   /api/og?type=player&name=…&elo=…&rating=…&kd=…&adr=…&wr=…&avatar=…&season=…
//   /api/og?type=lobby&name=…&game=…&host=…

const PURPLE = "#a855f7";
const PINK = "#ec4899";

function statChip(label: string, value: string, big = false) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: big ? "18px 34px" : "14px 26px",
        borderRadius: 18,
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.14)",
      }}
    >
      <div style={{ display: "flex", fontSize: big ? 54 : 40, fontWeight: 800, color: "#fff" }}>{value}</div>
      <div
        style={{
          display: "flex",
          fontSize: 19,
          fontWeight: 600,
          color: "rgba(255,255,255,0.55)",
          textTransform: "uppercase",
          letterSpacing: 2,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function frame(children: React.ReactNode) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#120a1c",
        backgroundImage:
          `radial-gradient(circle at 90% 0%, rgba(236,72,153,0.28), transparent 45%),` +
          `radial-gradient(circle at 0% 30%, rgba(168,85,247,0.32), transparent 45%),` +
          `radial-gradient(circle at 50% 100%, rgba(217,70,239,0.20), transparent 40%)`,
        padding: 56,
        position: "relative",
      }}
    >
      {/* top gradient hairline */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 10,
          display: "flex",
          background: `linear-gradient(90deg, ${PURPLE}, #d946ef, ${PINK})`,
        }}
      />
      {children}
      {/* brand footer */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 56,
          right: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", fontSize: 30 }}>🌱</div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 800, color: "#fff", letterSpacing: 1 }}>
            GARDEN RETAKES
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 24, fontWeight: 600, color: "rgba(255,255,255,0.45)" }}>
          retakes.fr
        </div>
      </div>
    </div>
  );
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const type = p.get("type") ?? "site";

  if (type === "player") {
    const name = p.get("name") ?? "Player";
    const elo = p.get("elo");
    const rating = p.get("rating");
    const kd = p.get("kd");
    const adr = p.get("adr");
    const wr = p.get("wr");
    const avatar = p.get("avatar");
    const season = p.get("season");

    return new ImageResponse(
      frame(
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 36, marginTop: 8 }}>
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                width={148}
                height={148}
                style={{ borderRadius: 999, border: `5px solid ${PURPLE}` }}
              />
            ) : (
              <div
                style={{
                  width: 148,
                  height: 148,
                  borderRadius: 999,
                  border: `5px solid ${PURPLE}`,
                  background: "rgba(168,85,247,0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 72,
                  fontWeight: 800,
                  color: "#fff",
                }}
              >
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 74, fontWeight: 900, color: "#fff", lineHeight: 1.05 }}>
                {name.slice(0, 22)}
              </div>
              <div style={{ display: "flex", fontSize: 28, fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
                {season ? `Player profile · ${season}` : "Player profile"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 22, marginTop: 54 }}>
            {elo && statChip("CS Rating", elo, true)}
            {rating && statChip("Rating", rating)}
            {kd && statChip("K/D", kd)}
            {adr && statChip("ADR", adr)}
            {wr && statChip("Win %", wr)}
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  if (type === "lobby") {
    const name = p.get("name") ?? "Game Lobby";
    const game = p.get("game");
    const host = p.get("host");

    return new ImageResponse(
      frame(
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: PINK, letterSpacing: 3 }}>
            🎮 GAMES HUB — YOU'RE INVITED
          </div>
          <div style={{ display: "flex", fontSize: 78, fontWeight: 900, color: "#fff", marginTop: 12, lineHeight: 1.05 }}>
            {name.slice(0, 28)}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 30 }}>
            {game && (
              <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#fff", padding: "12px 28px", borderRadius: 999, background: "rgba(168,85,247,0.35)", border: "1px solid rgba(168,85,247,0.7)" }}>
                {game}
              </div>
            )}
            {host && (
              <div style={{ display: "flex", fontSize: 30, fontWeight: 600, color: "rgba(255,255,255,0.75)", padding: "12px 28px", borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)" }}>
                hosted by {host.slice(0, 20)}
              </div>
            )}
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "rgba(255,255,255,0.5)", marginTop: 28 }}>
            UNO · Monopoly · Codenames · Cards Against · Make it Meme · Skribbl
          </div>
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  if (type === "page") {
    const title = p.get("title") ?? "Garden Retakes";
    const desc = p.get("desc") ?? "";
    const icon = p.get("icon") ?? "🌱";

    return new ImageResponse(
      frame(
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 84 }}>{icon}</div>
          <div style={{ display: "flex", fontSize: 82, fontWeight: 900, color: "#fff", marginTop: 16, lineHeight: 1.05 }}>
            {title.slice(0, 30)}
          </div>
          {desc && (
            <div style={{ display: "flex", fontSize: 32, fontWeight: 500, color: "rgba(255,255,255,0.65)", marginTop: 20, maxWidth: 950, lineHeight: 1.4 }}>
              {desc.slice(0, 140)}
            </div>
          )}
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  // Default site banner
  return new ImageResponse(
    frame(
      <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", alignItems: "center" }}>
        <div style={{ display: "flex", fontSize: 100, fontWeight: 900, color: "#fff", letterSpacing: 2 }}>
          GARDEN RETAKES
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 34,
            fontWeight: 600,
            color: "rgba(255,255,255,0.65)",
            marginTop: 18,
          }}
        >
          Rankings · Stats · Inventory · Games · Live
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 40 }}>
          {["🏆", "📊", "🔫", "🎮", "📺"].map((e) => (
            <div
              key={e}
              style={{
                display: "flex",
                width: 84,
                height: 84,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                fontSize: 42,
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.14)",
              }}
            >
              {e}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
