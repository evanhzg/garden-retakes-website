"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  COMMAND_GROUPS,
  COMMAND_MODES,
  namesOf,
  type CommandEntry,
  type CommandGroup,
  type CommandLevel,
  type CommandModeId,
} from "@/content/commands";
import "./commands.css";

// The command reference.
//
// Three things decide the shape of this page, and all three come from watching
// what people actually do here:
//
//   1. They arrive knowing the command and wanting the spelling. So search is
//      the primary control, it is focused by "/", and it matches aliases —
//      looking up "!buy" must find the entry filed under "guns".
//   2. They arrive knowing the mode and wanting to know what exists. So the
//      tabs are modes, and each one shows only what does something there.
//      "Everywhere" is a real tab rather than a duplicate of every other one.
//   3. They are copying into a chat box or into RCON, and those need different
//      prefixes. So the prefix is a switch rather than a footnote, and it
//      changes what Copy puts on the clipboard.
//
// Searching deliberately ignores the tab. A search that only looked inside the
// mode you happened to be on would answer "no such command" for a command that
// exists, which is the worst thing a reference can do.

const LEVELS: { id: CommandLevel; label: string }[] = [
  { id: "everyone", label: "Everyone" },
  { id: "mod", label: "Mod" },
  { id: "admin", label: "Admin" },
  { id: "owner", label: "Owner" },
];

const LEVEL_RANK: Record<CommandLevel, number> = { everyone: 0, mod: 1, admin: 2, owner: 3 };

type Prefix = "!" | "css_";

/** How a command reads with a given prefix. Console-only ignores the switch. */
function render(command: CommandEntry, prefix: Prefix): string {
  if (command.consoleOnly || prefix === "css_") return `css_${command.name}`;
  return `!${command.name}`;
}

function matches(command: CommandEntry, needle: string): boolean {
  if (!needle) return true;
  if (command.description.toLowerCase().includes(needle)) return true;
  if (command.args?.toLowerCase().includes(needle)) return true;
  // Typed with a prefix or without — "!ak", ".ak", "css_ak" and "ak" all find it.
  const bare = needle.replace(/^[!./]|^css_/, "");
  return namesOf(command).some((n) => n.toLowerCase().includes(bare));
}

export default function CommandsClient() {
  const { t } = useI18n();

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<CommandModeId>("global");
  const [prefix, setPrefix] = useState<Prefix>("!");
  const [maxLevel, setMaxLevel] = useState<CommandLevel | "all">("all");
  const [copied, setCopied] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search the way it does in every other reference people use;
  // Escape gets you back out of it without reaching for the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape" && typing) {
        setQuery("");
        searchRef.current?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;

  const visible = useMemo(() => {
    const ceiling = maxLevel === "all" ? 3 : LEVEL_RANK[maxLevel];

    return COMMAND_GROUPS.map((group) => {
      // While searching the tab is ignored on purpose — see the note above.
      if (!searching && !group.modes.includes(mode)) return null;

      const commands = group.commands.filter(
        (c) => LEVEL_RANK[c.level ?? "everyone"] <= ceiling && matches(c, needle),
      );

      return commands.length > 0 ? { ...group, commands } : null;
    }).filter(Boolean) as CommandGroup[];
  }, [mode, needle, searching, maxLevel]);

  const total = visible.reduce((n, g) => n + g.commands.length, 0);

  /** How many commands each tab would show, so an empty one is visibly empty. */
  const countFor = useMemo(() => {
    const out = new Map<CommandModeId, number>();
    for (const m of COMMAND_MODES) {
      out.set(
        m.id,
        COMMAND_GROUPS.filter((g) => g.modes.includes(m.id)).reduce((n, g) => n + g.commands.length, 0),
      );
    }
    return out;
  }, []);

  const copy = (command: CommandEntry) => {
    const text = render(command, prefix);
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(text);
        window.setTimeout(() => setCopied((c) => (c === text ? null : c)), 1600);
      })
      .catch(() => {
        // A clipboard the browser refuses is not worth an error dialog; the
        // command is on screen and selectable.
      });
  };

  return (
    <div className="cmd page-enter">
      <div className="cmd-controls">
        <div className="cmd-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            className="cmd-search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("commands.searchPlaceholder")}
            aria-label={t("commands.searchPlaceholder")}
          />
          {query ? (
            <button className="cmd-clear" onClick={() => setQuery("")} aria-label={t("commands.clear")}>
              ×
            </button>
          ) : (
            <kbd className="cmd-kbd">/</kbd>
          )}
        </div>

        {/* The prefix is a switch, not a footnote: it decides what Copy puts on
            the clipboard, and pasting a chat command into RCON does nothing. */}
        <div className="cmd-prefix" role="group" aria-label={t("commands.prefix")}>
          <button
            className={`cmd-prefix-btn ${prefix === "!" ? "on" : ""}`}
            onClick={() => setPrefix("!")}
            aria-pressed={prefix === "!"}
          >
            {t("commands.chat")} <code>!</code>
          </button>
          <button
            className={`cmd-prefix-btn ${prefix === "css_" ? "on" : ""}`}
            onClick={() => setPrefix("css_")}
            aria-pressed={prefix === "css_"}
          >
            {t("commands.console")} <code>css_</code>
          </button>
        </div>

        <div className="cmd-levels" role="group" aria-label={t("commands.level")}>
          <button
            className={`cmd-level-btn ${maxLevel === "all" ? "on" : ""}`}
            onClick={() => setMaxLevel("all")}
            aria-pressed={maxLevel === "all"}
          >
            {t("commands.allLevels")}
          </button>
          {LEVELS.map((l) => (
            <button
              key={l.id}
              className={`cmd-level-btn lvl-${l.id} ${maxLevel === l.id ? "on" : ""}`}
              onClick={() => setMaxLevel(l.id)}
              aria-pressed={maxLevel === l.id}
              title={t("commands.upTo")}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs disappear while searching rather than sitting there looking
          disabled: a search spans every mode, so a highlighted tab would be
          claiming something untrue about the results below it. */}
      {!searching && (
        <div className="cmd-tabs" role="tablist" aria-label={t("commands.modes")}>
          {COMMAND_MODES.map((m) => (
            <button
              key={m.id}
              role="tab"
              aria-selected={mode === m.id}
              className={`cmd-tab ${mode === m.id ? "on" : ""}`}
              onClick={() => setMode(m.id)}
              title={m.hint}
            >
              {m.label}
              <span className="cmd-tab-n num">{countFor.get(m.id) ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      {searching && (
        <p className="cmd-resultline muted">
          {total} {total === 1 ? t("commands.result") : t("commands.results")} “{query.trim()}”
        </p>
      )}

      {total === 0 ? (
        <div className="empty-hint">
          <p style={{ margin: 0 }}>{t("commands.nothing")}</p>
        </div>
      ) : (
        <div className="cmd-groups">
          {visible.map((group) => (
            <section key={group.id} className="cmd-group">
              <header className="cmd-group-head">
                <h3>{group.title}</h3>
                {/* While searching, a group is only meaningful with the mode it
                    belongs to attached — the tab is not there to say it. */}
                {searching && (
                  <span className="cmd-group-modes">
                    {group.modes
                      .map((id) => COMMAND_MODES.find((m) => m.id === id)?.label ?? id)
                      .join(" · ")}
                  </span>
                )}
              </header>

              {group.blurb && <p className="cmd-group-blurb muted">{group.blurb}</p>}

              <ul className="cmd-list">
                {group.commands.map((command) => {
                  const shown = render(command, prefix);
                  const level = command.level ?? "everyone";
                  return (
                    <li key={`${group.id}-${command.name}`} className="cmd-item">
                      <button
                        className="cmd-name"
                        onClick={() => copy(command)}
                        title={t("commands.copy")}
                      >
                        <code>{shown}</code>
                        {command.args && <span className="cmd-args">{command.args}</span>}
                        <span className="cmd-copied" aria-live="polite">
                          {copied === shown ? t("commands.copied") : ""}
                        </span>
                      </button>

                      <div className="cmd-body">
                        <p className="cmd-desc">{command.description}</p>
                        <div className="cmd-meta">
                          {command.aliases && command.aliases.length > 0 && (
                            <span className="cmd-aliases">
                              {t("commands.alsoKnown")}{" "}
                              {command.aliases
                                .map((a) => (command.consoleOnly || prefix === "css_" ? `css_${a}` : `!${a}`))
                                .join(" · ")}
                            </span>
                          )}
                          {command.consoleOnly && (
                            <span className="cmd-tag cmd-tag-console">{t("commands.consoleOnly")}</span>
                          )}
                          {level !== "everyone" && (
                            <span className={`cmd-tag lvl-${level}`}>
                              {LEVELS.find((l) => l.id === level)?.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
