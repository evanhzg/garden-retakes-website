"use client";
import { useI18n } from '@/components/I18nProvider';

import { useState } from "react";

export default function LinkClient({
  steamId,
  initialCode,
}: {
  steamId: string | null;
  initialCode: string;
}) {
    const { t } = useI18n();

  const [code, setCode] = useState(initialCode.toUpperCase());
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const confirm = async () => {
    setStatus("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/pkmn/auth/device/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong.");
      setStatus("done");
      setMessage(
        `Linked! You can close this tab and go back to Garden PKMN${data.deviceName ? ` on ${data.deviceName}` : ""}.`
      );
    } catch (e: any) {
      setStatus("error");
      setMessage(e.message || "Something went wrong.");
    }
  };

  if (!steamId) {
    return (
      <div style={{ textAlign: "center", maxWidth: 380 }}>
        <h1 style={{ marginBottom: 8 }}>{t("auto.linkclient.link_garden_pkmn")}</h1>
        <p style={{ color: "#aaa", marginBottom: 20 }}>
          {t("auto.linkclient.sign_in_with_steam_first_to_li")}
                        </p>
        <a
          href="/api/auth/steam/login"
          style={{
            background: "#a855f7",
            color: "#fff",
            padding: "10px 24px",
            borderRadius: 8,
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-block",
          }}
        >
          {t("auto.linkclient.sign_in_through_steam")}
                        </a>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div style={{ textAlign: "center", maxWidth: 380 }}>
        <h1 style={{ marginBottom: 8 }}>{t("auto.linkclient._linked")}</h1>
        <p style={{ color: "#aaa" }}>{message}</p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", maxWidth: 380 }}>
      <h1 style={{ marginBottom: 8 }}>{t("auto.linkclient.link_garden_pkmn")}</h1>
      <p style={{ color: "#aaa", marginBottom: 20 }}>
        {t("auto.linkclient.enter_the_code_shown_in_the_ga")}
                    </p>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder={t("auto.linkclient.abcd_1234")}
        maxLength={9}
        style={{
          padding: "10px 14px",
          fontSize: 20,
          letterSpacing: 2,
          textAlign: "center",
          borderRadius: 8,
          border: "none",
          width: "100%",
          marginBottom: 16,
          boxSizing: "border-box",
        }}
      />
      <button
        onClick={confirm}
        disabled={status === "loading" || code.trim().length < 9}
        style={{
          background: "#a855f7",
          color: "#fff",
          padding: "10px 24px",
          borderRadius: 8,
          fontWeight: 700,
          border: "none",
          cursor: status === "loading" ? "default" : "pointer",
          width: "100%",
          opacity: status === "loading" || code.trim().length < 9 ? 0.6 : 1,
        }}
      >
        {status === "loading" ? "Linking…" : "Link this code"}
      </button>
      {message && <p style={{ color: "#f87171", marginTop: 12 }}>{message}</p>}
    </div>
  );
}
