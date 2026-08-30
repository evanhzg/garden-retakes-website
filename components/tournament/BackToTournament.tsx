import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getT } from "@/lib/serverI18n";
import "./back.css";

/**
 * The way back up, from anywhere inside the tournament flow.
 *
 * Every step — register, join, a match, the live wall — is a page you reach
 * from the bracket and need to leave again. Two of them had a small text link
 * buried in a line of grey metadata, and two of them (the match page and the
 * live wall) had nothing at all: the only way out was the browser's back
 * button, which on a phone opened from a Discord link goes nowhere useful.
 *
 * Omitting the slug points it at the index instead, which is what the
 * tournament's own page needs: it is the one page in the flow with no
 * tournament above it, and it was the one page with no way out.
 *
 * One control, same place on every page, unmissable.
 */
export default function BackToTournament({
  slug,
  label,
}: {
  /** The tournament to return to. Omitted means the index. */
  slug?: string;
  /** Overrides the default label — e.g. "Back to bracket". */
  label?: string;
}) {
  const t = getT();

  // Both keys spelled out as literal t() calls: tools/check-i18n.mjs finds used
  // keys by scanning for exactly that, and a key it cannot see is a key that
  // gets deleted as unused one day.
  const fallback = slug ? t("register.backToTournament") : t("tournaments.backToList");

  return (
    <Link className="t-back" href={slug ? `/tournaments/${slug}` : "/tournaments"}>
      <ChevronLeft size={16} aria-hidden />
      <span>{label ?? fallback}</span>
    </Link>
  );
}
