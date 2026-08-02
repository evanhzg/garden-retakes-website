import Link from "next/link";
import { AdminLevel, getAdminContext, levelName } from "@/lib/adminAuth";
import { ADDON_VPK_DIRECTORIES } from "@/lib/customSkins";
import SkinManager from "@/components/admin/SkinManager";

export const dynamic = "force-dynamic";

export default async function AdminSkinsPage({
  searchParams,
}: {
  searchParams: { key?: string };
}) {
  const ctx = await getAdminContext(searchParams.key);

  if (ctx.level < AdminLevel.Moderator) {
    return (
      <section className="panel">
        <h2>Custom skins</h2>
        <div className="empty-hint">
          <p style={{ margin: 0 }}>
            You need an admin role to open this page. Sign in with an admin Steam account, or append{" "}
            <code>?key=…</code>.
          </p>
          {!ctx.steamId && (
            <a className="btn btn-primary" style={{ marginTop: 12 }} href="/api/auth/steam/login">
              Sign in with Steam
            </a>
          )}
        </div>
      </section>
    );
  }

  const keyQuery = searchParams.key ? `?key=${encodeURIComponent(searchParams.key)}` : "";

  return (
    <>
      <section className="panel">
        <div className="admin-head">
          <h2>Custom skins</h2>
          <span className="role-badge">{levelName(ctx.level)}</span>
        </div>
        <p className="muted" style={{ marginTop: -4 }}>
          Upload a packed weapon finish straight to the game server. Every upload and removal is recorded in the{" "}
          <Link href={`/admin-log${keyQuery}`}>admin log</Link>. Back to the{" "}
          <Link href={`/admin${keyQuery}`}>admin dashboard</Link>.
        </p>
      </section>

      <SkinManager adminKey={searchParams.key} canUpload={ctx.level >= AdminLevel.Admin} />

      <VpkReference />
    </>
  );
}

/**
 * What actually has to be inside the VPK.
 *
 * This is on the page rather than in the docs on purpose — it is the thing
 * that gets forgotten between one skin and the next, and the failure mode
 * (packing content/ instead of game/) produces a VPK that uploads cleanly and
 * then does nothing on the server.
 */
function VpkReference() {
  return (
    <>
      <section className="panel">
        <h2>What goes in the VPK</h2>
        <p style={{ marginTop: 0, fontSize: 14, maxWidth: "70ch" }}>
          The VPK&rsquo;s root is the addon&rsquo;s <strong>game</strong> folder —{" "}
          <code>game/csgo_addons/&lt;addon&gt;/</code> — not the folder above it and not{" "}
          <code>content/</code>. Pack the folder&rsquo;s <em>contents</em>, so that{" "}
          <code>materials/</code> sits at the archive root.
        </p>

        <pre className="skin-tree">
          <b>garden_ak_bloom.vpk</b>
          {"\n"}
          {"├── "}addoninfo.txt <i>&larr; addon name / metadata</i>
          {"\n"}
          {"└── "}materials/
          {"\n"}
          {"    └── "}models/weapons/customization/paints/custom/
          {"\n"}
          {"          ├── "}<b>garden_ak_bloom.vmat_c</b> <i>&larr; the finish, compiled</i>
          {"\n"}
          {"          ├── "}garden_ak_bloom_color.vtex_c
          {"\n"}
          {"          ├── "}garden_ak_bloom_normal.vtex_c
          {"\n"}
          {"          ├── "}garden_ak_bloom_rough.vtex_c
          {"\n"}
          {"          └── "}garden_ak_bloom_masks.vtex_c
        </pre>

        <h3 style={{ fontSize: 15, margin: "var(--space-6) 0 var(--space-2)" }}>Rules that actually bite</h3>
        <ol style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: "1.3em", margin: 0, maxWidth: "72ch" }}>
          <li>
            <strong>Compiled files only.</strong> <code>.vmat_c</code> and <code>.vtex_c</code>, which the
            Workshop Tools write into <code>game/</code>. The <code>.vmat</code>, <code>.tga</code> and{" "}
            <code>.psd</code> sources under <code>content/</code> are for the compiler, and the engine cannot
            read any of them. This is the mistake that produces a VPK which uploads fine and then does nothing.
          </li>
          <li>
            <strong>No wrapper folder.</strong> If the archive root contains <code>csgo_addons/</code> or your
            addon&rsquo;s own name, every path inside is off by one directory and nothing resolves.
          </li>
          <li>
            <strong>Keep the compile paths.</strong> A <code>.vmat_c</code> stores the absolute engine paths of
            the textures it references. Moving or renaming a <code>.vtex_c</code> after compiling breaks it —
            re-compile instead.
          </li>
          <li>
            <strong>Only these root folders are read</strong> (from CS2&rsquo;s own{" "}
            <code>gameinfo.gi</code> &rarr; <code>AddonConfig</code> &rarr; <code>VpkDirectories</code>):{" "}
            {ADDON_VPK_DIRECTORIES.map((d, i) => (
              <span key={d}>
                {i > 0 && ", "}
                <code>{d}</code>
              </span>
            ))}
            . Anything else in the archive is ignored.
          </li>
          <li>
            <strong>A finish is a material, not a model.</strong> You do not repack the weapon —{" "}
            <code>models/</code> stays out unless you genuinely replaced the mesh.
          </li>
          <li>
            <strong>Multi-part sets:</strong> a split archive is{" "}
            <code>&lt;name&gt;_dir.vpk</code> plus <code>&lt;name&gt;_000.vpk</code>, <code>_001.vpk</code>…
            The <code>_dir</code> file holds only the tree, so upload <em>every</em> part or the content is
            unreachable. One file under a couple of hundred MB is simpler.
          </li>
        </ol>
      </section>

      <section className="panel">
        <h2>Getting it onto players&rsquo; machines</h2>
        <p style={{ marginTop: 0, fontSize: 14, maxWidth: "72ch" }}>
          Uploading puts the VPK on the <em>server</em>, which is what lets the server mount and precache the
          finish. It does not put it on any client. CS2 dropped <code>sv_downloadurl</code>, and
          MultiAddonManager — which is how <code>mm_extra_addons</code> already pushes the workshop skins — only
          knows how to hand a client a Workshop id. A finish rendered from a VPK that only the server has will
          fall back to the default skin on every client that lacks it. Three ways round it:
        </p>
        <ul style={{ fontSize: 14, lineHeight: 1.7, paddingLeft: "1.3em", margin: 0, maxWidth: "72ch" }}>
          <li>
            <strong>Publish the same addon to the Workshop, unlisted, and let MultiAddonManager push it.</strong>{" "}
            This is the only automatic route. The finish <em>category</em> is closed, but a content addon
            carrying the same <code>materials/</code> tree is not, and clients download it through Steam like any
            other addon. Add the id to <code>mm_extra_addons</code>.
          </li>
          <li>
            <strong>Have players install it by hand.</strong> Every upload here is hosted at{" "}
            <code>/fastdl/&lt;file&gt;.vpk</code> — the <em>Download</em> button on each row. Players drop it in{" "}
            <code>game/csgo_addons/</code> and it mounts through <code>AddonRoot</code>.
          </li>
          <li>
            <strong>Server-side only.</strong> Fine for content the client never renders, and for testing that
            the VPK mounts and precaches at all before you publish it.
          </li>
        </ul>
      </section>
    </>
  );
}
