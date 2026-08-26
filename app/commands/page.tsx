import CommandsClient from "./CommandsClient";
import { ALL_COMMANDS } from "@/content/commands";
import { getT } from "@/lib/serverI18n";

export const metadata = {
  title: "Commands — Garden Retakes",
  description: "Every chat and console command the Garden servers answer to, by mode.",
};

export const dynamic = "force-static";

// The list itself is a typed module now rather than a markdown file parsed at
// request time — see content/commands.ts for why. That leaves this page with
// nothing to do but the heading, which is the right amount of work for it.

export default function CommandsPage() {
  const t = getT();

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <span className="eyebrow">{t("auto.page.commands")}</span>
          <h1>
            {t("commands.headingA")} <span className="grad">{t("commands.headingB")}</span>{" "}
            {t("commands.headingC")}
          </h1>
          <p className="muted">
            {t("commands.intro", { n: String(ALL_COMMANDS.length) })}
          </p>
        </div>
      </section>

      <section className="panel">
        <CommandsClient />
      </section>
    </>
  );
}
