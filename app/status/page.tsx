import { statusReport } from "@/lib/status";
import { getT } from "@/lib/serverI18n";
import StatusBoard from "./StatusBoard";
import "./status.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "Status",
  description: "Live status of the REEEETAKES website, database, matchmaking and game servers.",
};

/**
 * /status — is it us or is it you?
 *
 * Rendered with a real report on the server so the first paint is already the
 * answer, then kept fresh by StatusBoard polling /api/status.
 */
export default async function StatusPage() {
  const t = getT();
  const report = await statusReport();
  return (
    <div className="st">
      <header className="st-head">
        <span className="kicker">{t("status.kicker")}</span>
        <h1 className="st-title">{t("status.title")}</h1>
        <p className="st-lede">{t("status.lede")}</p>
      </header>
      <StatusBoard initial={report} />
    </div>
  );
}
