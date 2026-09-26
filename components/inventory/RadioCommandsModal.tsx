"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Radio, Volume2, X } from "lucide-react";
import agentAudioMapping from "@/lib/agent_audio_mapping.json";
import agentVoicesV2 from "@/data/agent_voices_v2.json";

type Command = { label: string; keys: string[]; file: string; variants?: string[] };

const AUDIO_BASE = "https://cdn.jsdelivr.net/gh/evanhzg/garden-retakes-website@assets/voice-lines/public/audio/agents";

const RADIO_CATEGORIES: { name: string; commands: Command[] }[] = [
  {
    name: "Preparation",
    commands: [
      { label: "Go Go Go", keys: ["go_go_go", "lets_go", "letsgo", "gogogo"], file: "go_go_go" },
      { label: "Fall Back", keys: ["fall_back", "fallback", "request_fallback"], file: "fall_back" },
      { label: "Stick Together", keys: ["stick_together"], file: "stick_together" },
      { label: "Hold This Position", keys: ["hold_this_position", "holdpos"], file: "hold_this_position" },
      { label: "Follow Me", keys: ["follow_me", "followme"], file: "follow_me" },
    ],
  },
  {
    name: "Movement",
    commands: [
      { label: "Go A", keys: ["go_a", "goa"], file: "go_a" },
      { label: "Go B", keys: ["go_b", "gob"], file: "go_b" },
      { label: "Go to Bombsite A", keys: ["goto_a", "gotoa"], file: "goto_a" },
      { label: "Go to Bombsite B", keys: ["goto_b", "gotob"], file: "goto_b" },
      { label: "Spread Out", keys: ["spread_out"], file: "spread_out" },
      { label: "Move Up", keys: ["move_up"], file: "move_up" },
      { label: "Cover Me", keys: ["cover_me", "coverme"], file: "cover_me" },
    ],
  },
  {
    name: "Commands",
    commands: [
      { label: "Need Drop", keys: ["need_drop"], file: "need_drop" },
      { label: "Need Backup", keys: ["need_backup", "coverme", "request_coverme"], file: "need_backup" },
      { label: "Need Decoy", keys: ["need_decoy"], file: "need_decoy" },
      { label: "Need Smoke", keys: ["need_smoke"], file: "need_smoke" },
      { label: "Need Flashbang", keys: ["need_flashbang"], file: "need_flashbang" },
      { label: "Need Grenade", keys: ["need_grenade"], file: "need_grenade" },
      { label: "Need Incendiary", keys: ["need_incendiary"], file: "need_incendiary" },
      { label: "Take the Point", keys: ["take_the_point", "point"], file: "take_the_point" },
      { label: "Regroup", keys: ["regroup"], file: "regroup" },
    ],
  },
  {
    name: "Report",
    commands: [
      { label: "Enemy Spotted", keys: ["enemy_spotted", "spotted"], file: "enemy_spotted" },
      { label: "Sector Clear", keys: ["sector_clear", "clear"], file: "sector_clear" },
      { label: "I'm in Position", keys: ["im_in_position", "position"], file: "im_in_position" },
      { label: "Reporting In", keys: ["report_in", "reporting_in"], file: "report_in" },
      { label: "Get in Position", keys: ["get_in_position"], file: "get_in_position" },
      { label: "Sniper Warning", keys: ["sniper_warning"], file: "sniper_warning" },
      { label: "Taking Fire", keys: ["taking_fire"], file: "taking_fire" },
      { label: "Multiple Enemies", keys: ["multiple_enemies"], file: "multiple_enemies" },
      { label: "Enemy Down", keys: ["enemy_down"], file: "enemy_down" },
      { label: "Area Secure", keys: ["area_secure"], file: "area_secure" },
      { label: "Bombsite A Clear", keys: ["bombsite_a_clear"], file: "bombsite_a_clear" },
      { label: "Bombsite B Clear", keys: ["bombsite_b_clear"], file: "bombsite_b_clear" },
      { label: "Hearing Noise", keys: ["hearing_noise"], file: "hearing_noise" },
      { label: "Heard Something", keys: ["heard_something"], file: "heard_something" },
      { label: "Need Assistance", keys: ["need_assistance"], file: "need_assistance" },
      { label: "Requesting Backup", keys: ["requesting_backup"], file: "requesting_backup" },
      { label: "Under Attack", keys: ["under_attack"], file: "under_attack" },
    ],
  },
  {
    name: "Bomb Status",
    commands: [
      { label: "Bomb Planted", keys: ["bomb_planted"], file: "bomb_planted" },
      { label: "Bomb Dropped", keys: ["bomb_dropped"], file: "bomb_dropped" },
      { label: "Bomb Picked Up", keys: ["bomb_picked_up"], file: "bomb_picked_up" },
      { label: "Guarding the Bomb", keys: ["guarding_the_bomb"], file: "guarding_the_bomb" },
      { label: "Defusing the Bomb", keys: ["defusing_the_bomb"], file: "defusing_the_bomb" },
      { label: "Get Out of There!", keys: ["get_out"], file: "get_out" },
      { label: "Bomb at A", keys: ["bomb_at_a"], file: "bomb_at_a" },
      { label: "Bomb at B", keys: ["bomb_at_b"], file: "bomb_at_b" },
      { label: "Need to Plant", keys: ["need_to_plant"], file: "need_to_plant" },
      { label: "Need to Defuse", keys: ["need_to_defuse"], file: "need_to_defuse" },
    ],
  },
  {
    name: "Responses",
    commands: [
      { label: "Affirmative", keys: ["affirmative", "agree"], file: "affirmative" },
      { label: "Negative", keys: ["negative", "disagree"], file: "negative" },
      { label: "Cheer", keys: ["cheer"], file: "cheer" },
      { label: "Compliment", keys: ["compliment", "nice"], file: "compliment" },
      { label: "Thanks", keys: ["thanks"], file: "thanks" },
      { label: "Sorry", keys: ["sorry"], file: "sorry" },
      { label: "You're Welcome", keys: ["youre_welcome"], file: "youre_welcome" },
      { label: "Quiet!", keys: ["quiet"], file: "quiet" },
      { label: "Good Job", keys: ["good_job"], file: "good_job" },
      { label: "Nice", keys: ["nice_shot", "nice"], file: "nice" },
      { label: "Oh No", keys: ["oh_no"], file: "oh_no" },
    ],
  },
  {
    name: "Grenades",
    commands: [
      { label: "Throwing Smoke", keys: ["throwing_smoke", "smoke"], file: "throwing_smoke" },
      { label: "Throwing Flashbang", keys: ["throwing_flashbang", "flash"], file: "throwing_flashbang" },
      { label: "Throwing Grenade", keys: ["throwing_grenade", "grenade"], file: "throwing_grenade" },
      { label: "Throwing Decoy", keys: ["throwing_decoy", "decoy"], file: "throwing_decoy" },
      { label: "Throwing Incendiary", keys: ["throwing_incendiary", "incendiary", "molotov"], file: "throwing_incendiary" },
    ],
  },
];

/**
 * Agents whose own voice folder is missing a line borrow it from their base
 * faction, which is where the stock lines live.
 */
const BASE_FACTION_MAP: Record<string, string> = {
  professional_epic: "professionals",
  professional_fem: "professionals",
  seal_epic: "seal_team_6",
  seal_fem: "seal_team_6",
  seal_diver_01: "seal_team_6",
  seal_diver_02: "seal_team_6",
  seal_diver_03: "seal_team_6",
  swat_epic: "swat",
  swat_fem: "swat",
  balkan_epic: "balkan",
  leet_epic: "leet",
  fbihrt_epic: "fbi",
  gendarmerie_fem: "gign",
  gendarmerie_fem_epic: "gign",
  jungle_fem: "jungle",
  jungle_fem_epic: "jungle",
  jungle_male_epic: "jungle",
  sas: "sas",
  phoenix: "phoenix_connexion",
};

const matchesKey = (v: string, k: string) =>
  v.includes(`_${k}_`) || v.includes(`${k}_`) || v.includes(`_${k}.`) || v.includes(`${k}.`);

/** The radio lines an agent's voice actor recorded, grouped the way the in-game wheel groups them. */
export default function RadioCommandsModal({
  agentId,
  agentName,
  onClose,
}: {
  agentId: number;
  agentName: string;
  onClose: () => void;
}) {
  const factionId: string | undefined = (agentAudioMapping as Record<string, string>)[String(agentId)];
  const voices: string[] = useMemo(
    () => (factionId ? (agentVoicesV2 as Record<string, { sounds?: string[] }>)[factionId]?.sounds ?? [] : []),
    [factionId],
  );
  const [playIndexes, setPlayIndexes] = useState<Record<string, number>>({});
  const [active, setActive] = useState("Preparation");

  const categories = useMemo(() => {
    // Anything the predefined wheel does not claim is an "event" line —
    // round-start chatter, kill barks — grouped by its base name.
    const predefined = RADIO_CATEGORIES.flatMap((c) => c.commands).flatMap((cmd) => cmd.keys);
    const events: Record<string, string[]> = {};
    for (const v of voices) {
      if (predefined.some((k) => matchesKey(v, k))) continue;
      const base = v.replace(/_?(0[0-9]|[1-9][0-9]|v[0-9]+)?\.(wav|mp3)$/, "");
      (events[base] ??= []).push(v);
    }
    const eventCommands: Command[] = Object.entries(events)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([base, variants]) => ({
        label: base.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        keys: [base],
        file: base,
        variants: variants.sort(),
      }));
    return [...RADIO_CATEGORIES, { name: "Events", commands: eventCommands }];
  }, [voices]);

  const category = categories.find((c) => c.name === active) ?? categories[0];

  const buttons = category.commands
    .map((cmd) => {
      const variants =
        cmd.variants ??
        voices
          .filter((v) =>
            cmd.keys.some((k) => {
              if (matchesKey(v, k)) return true;
              const nk = k.replace(/_/g, "").toLowerCase();
              const base = v.split(".")[0].toLowerCase();
              return new RegExp(`${nk}(0[0-9]|[1-9][0-9]|v[0-9]+)?$`, "i").test(base);
            }),
          )
          .sort();
      const idx = playIndexes[cmd.label] ?? 0;
      const native = variants.length > 0;
      const src = native
        ? `${AUDIO_BASE}/${factionId}/${variants[idx % variants.length]}`
        : `${AUDIO_BASE}/${(factionId && BASE_FACTION_MAP[factionId]) || factionId}/${cmd.file}.wav`;
      return { cmd, native, count: variants.length, idx, src };
    })
    // The agent's own recordings first; borrowed faction lines after.
    .sort((a, b) => Number(b.native) - Number(a.native));

  return createPortal(
    <div className="iv-modal" role="dialog" aria-modal="true" aria-labelledby="iv-radio-title" onClick={onClose}>
      <div className="iv-modal-card iv-radio" onClick={(e) => e.stopPropagation()}>
        <header className="iv-modal-head">
          <Radio size={18} aria-hidden />
          <h2 id="iv-radio-title">
            Radio <span className="iv-modal-sub">{agentName}</span>
          </h2>
          <button className="iv-icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {!factionId ? (
          <p className="iv-empty">No voice lines are mapped for this agent.</p>
        ) : (
          <>
            <div className="iv-seg iv-radio-cats" role="tablist">
              {categories.map((c) => (
                <button
                  key={c.name}
                  role="tab"
                  aria-selected={c.name === category.name}
                  className={c.name === category.name ? "on" : ""}
                  onClick={() => setActive(c.name)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="iv-radio-grid">
              {buttons.map(({ cmd, native, count, idx, src }) => (
                <button
                  key={cmd.label}
                  className={`iv-radio-line ${native ? "" : "borrowed"}`}
                  onClick={() => {
                    new Audio(src).play().catch(() => {});
                    setPlayIndexes((p) => ({ ...p, [cmd.label]: (p[cmd.label] ?? 0) + 1 }));
                  }}
                  title={native ? undefined : "Not recorded by this agent — plays the faction's line"}
                >
                  <Volume2 size={14} aria-hidden />
                  <span className="iv-radio-label">{cmd.label}</span>
                  <span className="iv-radio-count num">
                    {native ? `${(idx % count) + 1}/${count}` : "faction"}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
