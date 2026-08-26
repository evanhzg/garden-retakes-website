import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getT } from "@/lib/serverI18n";
import "./back.css";

/**
 * The way back to the tournament page, from anywhere inside a tournament.
 *
 * Every step of the flow — register, join, a match, the live wall — is a page
 * you reach from the bracket and need to leave again. Two of them had a small
 * text link buried in a line of grey metadata, and two of them (the match page
 * and the live wall) had nothing at all: the only way out was the browser's
 * back button, which on a phone opened from a Discord link goes nowhere useful.
 *
 * One control, same place on every page, unmissable.
 */
export default function BackToTournament({
  slug,
  label,
}: {
  slug: string;
  /** Overrides the default "Back to tournament" — e.g. "Back to bracket". */
  label?: string;
}) {
  const t = getT();
  return (
    <Link className="t-back" href={`/tournaments/${slug}`}>
      <ChevronLeft size={16} aria-hidden />
      <span>{label ?? t("register.backToTournament")}</span>
    </Link>
  );
}
