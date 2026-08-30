"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * The admin panel on an org page.
 *
 * Rendered only for admins, and every action behind it is checked again on the
 * server — this is a convenience, not the gate. Deliberately plain: it is used
 * by the handful of people who run the site, not by the public, and a form that
 * says exactly what each field does beats one that looks nice.
 */
export default function OrgAdmin({ org }: { org: { id: number; slug: string } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgId: org.id, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      setNote(data?.ok ? "Saved." : (data?.error ?? "Failed."));
      if (data?.ok) router.refresh();
    } catch (err) {
      setNote(String(err));
    } finally {
      setBusy(false);
    }
  };

  const saveDetails = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    post({
      action: "edit",
      description: f.get("description"),
      discordUrl: f.get("discordUrl"),
      twitchUrl: f.get("twitchUrl"),
      youtubeUrl: f.get("youtubeUrl"),
      twitterUrl: f.get("twitterUrl"),
      websiteUrl: f.get("websiteUrl"),
      // Accepts a full watch link or a bare id; the server pulls the id out.
      trailer: f.get("trailer"),
    });
  };

  const addMember = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    post({ action: "addMember", steamId: f.get("steamId"), role: f.get("role") });
    (e.target as HTMLFormElement).reset();
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBusy(true);
    setNote(null);
    try {
      const form = new FormData();
      form.set("orgId", String(org.id));
      form.set("image", file);
      const res = await fetch("/api/orgs/image", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      setNote(data?.ok ? "Image saved." : (data?.error ?? "Failed."));
      if (data?.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel org-admin">
      <h3>Organization settings</h3>
      {note && <p className="org-note">{note}</p>}

      <form onSubmit={saveDetails} className="org-form">
        <label>
          Description
          <textarea name="description" rows={4} maxLength={4000} />
        </label>

        <div className="org-grid">
          <label>Discord<input name="discordUrl" type="url" placeholder="https://discord.gg/…" /></label>
          <label>Twitch<input name="twitchUrl" type="url" placeholder="https://twitch.tv/…" /></label>
          <label>YouTube<input name="youtubeUrl" type="url" placeholder="https://youtube.com/@…" /></label>
          <label>X<input name="twitterUrl" type="url" placeholder="https://x.com/…" /></label>
          <label>Website<input name="websiteUrl" type="url" placeholder="https://…" /></label>
          <label>Trailer<input name="trailer" type="text" placeholder="YouTube link or id" /></label>
        </div>

        <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
      </form>

      <div className="org-form">
        <label>
          Presentation image
          <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={upload} disabled={busy} />
        </label>
      </div>

      <form onSubmit={addMember} className="org-form org-member-add">
        <label>SteamID64<input name="steamId" pattern="\\d{17}" required placeholder="7656119…" /></label>
        <label>
          Role
          <select name="role" defaultValue="moderator">
            {/* Said in full, because the difference is the point of having two:
                a moderator works the event and cannot change what it is. */}
            <option value="moderator">Moderator — tickets, admin calls, match fixes</option>
            <option value="organizer">Organizer — runs and edits tournaments</option>
          </select>
        </label>
        <button type="submit" className="btn" disabled={busy}>Add or update</button>
      </form>
    </section>
  );
}
