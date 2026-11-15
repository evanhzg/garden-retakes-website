"use client";

import { useI18n } from "@/components/I18nProvider";
import { gadgetFor } from "@/lib/tournament/roles";
import GadgetIcon from "./GadgetIcon";
import "./roleupgrade.css";

// A role's upgrade, explained: its gadget's mark, name and what it does.
//
// Shown wherever a role is explained at length (the homepage's role cards) and,
// compact, wherever one is picked (the draft board), because a gadget nobody has
// heard of before the match is a gadget that gets thrown like a decoy. Renders
// nothing for the roles that play stock.

export default function RoleUpgrade({ roleId, compact = false }: { roleId: string; compact?: boolean }) {
  const { t } = useI18n();
  const gadget = gadgetFor(roleId);
  if (!gadget) return null;

  if (compact) {
    return (
      <span className="ru-compact" title={t(`gadget.${gadget.id}.desc`)}>
        <GadgetIcon id={gadget.id} size={12} />
        {t(`gadget.${gadget.id}.name`)}
      </span>
    );
  }

  return (
    <div className="ru">
      <span className="ru-icon" aria-hidden>
        <GadgetIcon id={gadget.id} size={26} />
      </span>
      <div className="ru-body">
        <span className="ru-kicker">{t("home.roles.upgrade")}</span>
        <strong>{t(`gadget.${gadget.id}.name`)}</strong>
        <p>{t(`gadget.${gadget.id}.desc`)}</p>
      </div>
    </div>
  );
}
