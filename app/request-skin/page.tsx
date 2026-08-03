"use client";

import Link from "next/link";
import React from "react";
import { useI18n } from '@/components/I18nProvider';

// This page was written in Tailwind utility classes, and the project has no
// Tailwind — every one of them resolved to nothing, so the page rendered as
// unstyled HTML. It now uses the same tokens and primitives as the rest of the
// site. The direct .vpk upload that used to live at the bottom moved to
// /admin/skins, because it wrote straight into the game server's content
// directory from an endpoint with no authorization on it.

export default function SkinRequestPage() {
    const { t } = useI18n();

  return (
    <>
      <section className="panel">
        <span className="kicker">{t("auto.page.skins")}</span>
        <h2 style={{ marginTop: "var(--space-2)" }}>{t("auto.page.request_a_custom_skin")}</h2>
      </section>

      <section className="panel">
        <h2>{t("auto.page.already_have_a_packed_vpk")}</h2>
        <p style={{ maxWidth: "70ch", fontSize: 14 }}>
          {t("auto.page.a_finish_authored_locally_subs")}{" "}
          <Link href="/admin/skins">{t("auto.page.the_custom_skins_admin_page")}</Link>{t("auto.page._which_validates_the_archive_s")}
                          </p>
        <Link className="btn btn-secondary" href="/admin/skins">
          {t("auto.page.upload_a_vpk")}
                          </Link>
      </section>
    </>
  );
}
