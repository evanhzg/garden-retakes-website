"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { User, Settings, Package, Shield, LogOut } from "lucide-react";
import AvatarImage from "./AvatarImage";
import ProfileSettingsModal from "./profile/ProfileSettingsModal";
import { useI18n } from "./I18nProvider";
import "./avatar-menu.css";

/**
 * The account menu behind the header avatar.
 *
 * Profile, Settings, Inventory and Admin used to be four more entries competing
 * for room in a nav bar that already had a dozen. They are all "things about
 * me" rather than "places on the site", which is exactly the split an account
 * menu exists to make — so they moved here and left the nav to the site.
 *
 * Settings opens the real modal from the profile page rather than linking to
 * it. It is the same component, so there is one settings form on the site and
 * not a second one that drifts.
 */
export default function AvatarMenu({
  steamId,
  name,
  avatar,
  adminLevel = 0,
  getHref,
}: {
  steamId?: string | null;
  name?: string | null;
  avatar?: string | null;
  adminLevel?: number;
  getHref: (path: string) => string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Hover opens it, but a hover that closes the instant the pointer leaves the
     avatar is unusable — the gap between the avatar and the first row is enough
     to lose it. A short close delay spans that gap, and re-entering cancels. */
  const openNow = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  };

  useEffect(() => () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  /* Touch devices have no hover at all, so the avatar is also a button, and a
     tap outside closes what a tap opened. */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = name ?? t("nav.profile");

  return (
    <>
      <div
        className="avatar-menu"
        ref={wrapRef}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
      >
        <button
          type="button"
          className="avatar-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          title={label}
          onClick={() => setOpen((v) => !v)}
        >
          {/* A session can be authenticated without a Steam id (the games side
              signs in separately), and AvatarImage keys its fallback off the
              id — so pass the empty string rather than widening its contract. */}
          <AvatarImage
            steamId={steamId ?? ""}
            src={avatar}
            alt={label}
            className="avatar avatar-sm"
          />
        </button>

        <div className={`avatar-menu-panel ${open ? "open" : ""}`} role="menu">
          <div className="avatar-menu-head">
            <span className="avatar-menu-name">{label}</span>
            <span className="avatar-menu-sub">{t("nav.profile")}</span>
          </div>

          <Link
            href={getHref("/profile")}
            className="avatar-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <User size={15} />
            <span>{t("nav.profile")}</span>
          </Link>

          <button
            type="button"
            className="avatar-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setSettingsOpen(true);
            }}
          >
            <Settings size={15} />
            <span>{t("nav.settings")}</span>
          </button>

          <Link
            href={getHref("/inventory")}
            className="avatar-menu-item"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            <Package size={15} />
            <span>{t("nav.inventory")}</span>
          </Link>

          {adminLevel > 0 && (
            <Link
              href={getHref("/admin")}
              className="avatar-menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <Shield size={15} />
              <span>{t("nav.admin")}</span>
            </Link>
          )}

          <a className="avatar-menu-item danger" role="menuitem" href="/api/auth/logout">
            <LogOut size={15} />
            <span>{t("nav.signOut")}</span>
          </a>
        </div>
      </div>

      {settingsOpen && <ProfileSettingsModal onClose={() => setSettingsOpen(false)} />}
    </>
  );
}
