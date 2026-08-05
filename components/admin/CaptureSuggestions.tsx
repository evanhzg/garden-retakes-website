"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";

type Suggestion = {
  id: number;
  lineupId: number;
  lineupName?: string;
  setpos: string;
  notes: string;
  createdAt: string;
};

export default function CaptureSuggestions({ adminKey }: { adminKey?: string }) {
  const { t } = useI18n();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch(`/api/admin/capture-suggestions${adminKey ? `?key=${adminKey}` : ""}`)
      .then((r) => r.json())
      .then((j) => {
        setSuggestions(j.suggestions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [adminKey]);

  const act = async (id: number, action: "approve" | "reject") => {
    await fetch(`/api/admin/capture-suggestions`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: adminKey, id, action }),
    });
    load();
  };

  if (loading) return <p className="muted">{t("common.loading")}</p>;

  if (suggestions.length === 0) return <p className="empty-hint">{t("admin.captureSuggestions.empty")}</p>;

  return (
    <div className="adm-scroll">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">{t("admin.captureSuggestions.lineup")}</th>
            <th scope="col">{t("admin.captureSuggestions.setpos")}</th>
            <th scope="col">{t("admin.captureSuggestions.notes")}</th>
            <th scope="col">{t("auto.adminpanel.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {suggestions.map((s) => (
            <tr key={s.id}>
              <td>{s.lineupName || s.lineupId}</td>
              <td><code style={{ fontSize: "12px" }}>{s.setpos}</code></td>
              <td>{s.notes}</td>
              <td>
                <div style={{ display: "flex", gap: "8px" }}>
                  <button className="btn btn-secondary" onClick={() => act(s.id, "approve")}>
                    {t("admin.approve")}
                  </button>
                  <button className="btn btn-ghost" onClick={() => act(s.id, "reject")}>
                    {t("admin.reject")}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
