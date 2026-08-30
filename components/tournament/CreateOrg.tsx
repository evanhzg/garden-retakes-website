"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";

/**
 * Making an organization.
 *
 * A name and nothing else. Everything an org has — description, links, logo,
 * members — is edited on its own page by OrgAdmin, and asking for all of it up
 * front turns "I want somewhere to put my tournaments" into a form. The slug is
 * derived from the name by the server (orgSlug), so there is nothing here to
 * get wrong except the name.
 *
 * Rendered only where the caller may actually create one, and the API checks
 * again: this is a convenience, not the gate.
 */
export default function CreateOrg() {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (!name) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", name }),
      });
      const data = await res.json().catch(() => ({}));

      // Straight to the new org rather than back to the list. The next thing
      // anybody does after creating one is fill it in, and that lives there.
      if (data?.ok && data?.slug) router.push(`/orgs/${data.slug}`);
      else setError(String(data?.error ?? t("orgs.createFailed")));
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="org-form org-create" onSubmit={submit}>
      {error && <p className="org-note">{error}</p>}

      <label>
        {t("orgs.nameLabel")}
        <input name="name" required minLength={2} maxLength={80} placeholder={t("orgs.namePlaceholder")} />
      </label>

      <button type="submit" className="btn btn-primary" disabled={busy}>
        {t("orgs.createButton")}
      </button>
    </form>
  );
}
