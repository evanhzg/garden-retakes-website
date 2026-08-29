"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

/**
 * Making a standing team.
 *
 * Folded behind a button rather than sitting open: most visits to this page are
 * to look at teams, and a form nobody is using is a form in the way. The name
 * is the only thing asked for — a tag is decoration and can be added on the
 * team's own page, and asking for both up front is two decisions where one
 * would do.
 */
export default function CreateTeam() {
  const { t } = useI18n();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn btn-secondary tm-create-open" onClick={() => setOpen(true)}>
        <Plus size={15} />
        {t("teams.create")}
      </button>
    );
  }

  return (
    <form
      className="tm-create"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);

        try {
          const res = await fetch("/api/teams", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "create", name: name.trim() }),
          });

          const data = await res.json();
          if (!res.ok || data.error) {
            setError(String(data.error ?? "That did not work."));
            return;
          }

          // Straight to the team, which is where everything else about it
          // happens — being returned to a list you have just added to is a
          // second click for no reason.
          router.push(`/teams/${data.slug}`);
        } catch (err) {
          setError(String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("teams.namePlaceholder")}
        maxLength={64}
        autoFocus
      />
      <button className="btn btn-primary" disabled={busy || name.trim().length < 2}>
        {t("teams.create")}
      </button>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
        {t("matchAdmin.cancel")}
      </button>

      {error && <p className="tm-error">{error}</p>}
    </form>
  );
}
