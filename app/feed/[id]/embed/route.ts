import { getSharedClip, absolute, siteOrigin } from "@/lib/feedClip";
import { youtubeEmbed } from "@/lib/feedShared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The iframe a share link unfurls into.
//
// This is a route handler returning a whole document rather than a page,
// because a page would inherit the root layout — nav bar, background canvas,
// fonts, the React bundle — inside a 400px Discord card. Next only allows a
// second root layout by moving every existing route into a group, which is a
// lot of churn for one small document.
//
// So it is hand-written, self-contained, and carries the site's colours and
// type. Native <video controls> gives a scrubber, volume and a fullscreen
// button that behave the way the host platform expects.

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const clip = await getSharedClip(Number(params.id));
  if (!clip) return new Response("Clip not found", { status: 404 });

  const permalink = `${siteOrigin()}/feed/${clip.id}`;
  const poster = clip.thumb ? absolute(clip.thumb) : "";

  const stage =
    clip.kind === "youtube"
      ? `<iframe src="${esc(youtubeEmbed(clip.source))}" title="${esc(clip.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
      // One source, the best rendition. Listing all three would look like a
      // quality ladder but is not one: a browser takes the first <source> it
      // can play and never reconsiders, and they are all h264/mp4, so the
      // extras are never reached. Switching quality is the site player's job.
      : `<video controls playsinline preload="metadata"${poster ? ` poster="${esc(poster)}"` : ""}
      src="${esc(absolute(clip.variants[0]?.url ?? ""))}"></video>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(clip.title)} · REEEETAKES</title>
<style>
  :root { color-scheme: dark; --bg:#100f0e; --surface:#191817; --ink:#f3f2f2; --muted:#9b9797; --accent:#ff4a28; --line:#363433; }
  * { box-sizing: border-box; }
  html, body { margin:0; height:100%; background:var(--bg); color:var(--ink);
    font-family: ui-sans-serif, system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .wrap { display:flex; flex-direction:column; height:100%; }
  .stage { position:relative; flex:1 1 auto; min-height:0; background:#000; }
  video, iframe { position:absolute; inset:0; width:100%; height:100%; border:0; display:block; object-fit:contain; }
  .bar { flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:8px 12px;
    background:var(--surface); border-top:1px solid var(--line); min-width:0; }
  .title { font-size:13px; font-weight:600; letter-spacing:-0.01em; white-space:nowrap;
    overflow:hidden; text-overflow:ellipsis; flex:1 1 auto; min-width:0; }
  .by { font-size:12px; color:var(--muted); white-space:nowrap; }
  .open { flex:0 0 auto; font-size:12px; font-weight:600; text-decoration:none; color:var(--bg);
    background:var(--accent); padding:5px 10px; border-radius:6px; white-space:nowrap; }
  .open:hover { filter:brightness(1.08); }
  /* Under about 320px a Discord card has no room for anything but the video. */
  @media (max-height: 200px) { .bar { display:none; } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="stage">${stage}</div>
    <div class="bar">
      <span class="title">${esc(clip.title)}</span>
      <span class="by">${esc(clip.author)}</span>
      <a class="open" href="${esc(permalink)}" target="_blank" rel="noopener">Open ↗</a>
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Embedding is the entire point, so this must stay frameable.
      "cache-control": "public, max-age=300",
    },
  });
}
