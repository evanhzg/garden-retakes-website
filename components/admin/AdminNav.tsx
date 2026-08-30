"use client";

import Link from "next/link";
import type { AdminNavGroup, AdminPanelId, AdminPanelLink } from "./adminSections";
import "./admin.css";

/**
 * The sidebar both admin panels share.
 *
 * One component rather than one per panel, because the two are the same object
 * — grouped entries, a level gate, a description each — and the moment they
 * were two files they would start drifting in padding and icon size.
 *
 * It draws what it is given and nothing else: filtering by standing happens in
 * adminSections.visibleSections, so a caller cannot forget the gate by
 * forgetting to pass a flag.
 */
export default function AdminNav({
  panel,
  panels,
  groups,
  active,
  onSelect,
  counts,
  keyQuery = "",
  label,
}: {
  panel: AdminPanelId;
  /** The panels this viewer can open. The switcher is hidden when there is one. */
  panels: AdminPanelLink[];
  groups: AdminNavGroup[];
  active: string;
  onSelect: (id: string) => void;
  /** Badge numbers by tab id, for the few tabs that have a count worth showing. */
  counts?: Record<string, number | undefined>;
  /** `?key=…` carried through, so a key-authorized session keeps working. */
  keyQuery?: string;
  label: string;
}) {
  return (
    <nav className="adm-nav" aria-label={label}>
      {panels.length > 1 && (
        <div className="adm-switch" role="group" aria-label="Admin panels">
          {panels.map((entry) => {
            const Icon = entry.icon;
            const here = entry.id === panel;
            return (
              <Link
                key={entry.id}
                href={`${entry.href}${keyQuery}`}
                className={`adm-switch-item ${here ? "active" : ""}`}
                aria-current={here ? "page" : undefined}
                title={entry.hint}
              >
                <Icon size={14} strokeWidth={1.9} aria-hidden />
                <span>{entry.label}</span>
              </Link>
            );
          })}
        </div>
      )}

      {groups.map((section) => (
        <div key={section.group} className="adm-nav-group">
          <span className="adm-nav-title">{section.group}</span>
          {section.items.map((item) => {
            const Icon = item.icon;
            const count = counts?.[item.id];
            const body = (
              <>
                <span className="adm-nav-icon" aria-hidden>
                  <Icon size={15} strokeWidth={1.75} />
                </span>
                <span className="adm-nav-text">
                  <span className="adm-nav-label">
                    {item.label}
                    {count !== undefined && count > 0 && <span className="pro-tab-count">{count}</span>}
                  </span>
                  <span className="adm-nav-hint">{item.hint}</span>
                </span>
              </>
            );

            // An entry that leaves the panel is a link, so it can be opened in a
            // new tab and shows its destination in the status bar. A button that
            // navigates does neither.
            return item.href ? (
              <Link key={item.id} href={`${item.href}${keyQuery}`} className="adm-nav-item">
                {body}
              </Link>
            ) : (
              <button
                key={item.id}
                type="button"
                id={`adm-tab-${item.id}`}
                aria-current={active === item.id ? "page" : undefined}
                aria-controls={`adm-panel-${item.id}`}
                className={`adm-nav-item ${active === item.id ? "active" : ""}`}
                onClick={() => onSelect(item.id)}
              >
                {body}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
