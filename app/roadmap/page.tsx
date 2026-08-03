import fs from "node:fs";
import path from "node:path";
import RoadmapClient, { RoadmapSection } from "./RoadmapClient";
import { getT } from '@/lib/serverI18n';

export const metadata = {
  title: "Roadmap — Garden Retakes",
  description: "Everything shipped and everything coming to the Garden Retakes server.",
};

export const dynamic = "force-static";

function parseRoadmap(markdown: string) {
  const lines = markdown.split("\n");
  const sections: RoadmapSection[] = [];
  let currentSection: RoadmapSection | null = null;
  let intro = "";

  for (const line of lines) {
    if (line.startsWith("## ")) {
      const fullTitle = line.replace("## ", "").trim();
      // Remove leading "1. " or "2. "
      const cleanTitle = fullTitle.replace(/^\d+\.\s*/, "").split("(")[0].trim();
      
      currentSection = {
        title: fullTitle,
        cleanTitle: cleanTitle,
        content: "",
      };
      sections.push(currentSection);
      continue;
    }

    if (!currentSection) {
      if (!line.startsWith("# ")) {
        intro += line + "\n";
      }
    } else {
      currentSection.content += line + "\n";
    }
  }

  return { intro: intro.trim(), sections };
}

function loadRoadmap() {
  const filePath = path.join(process.cwd(), "content", "roadmap.md");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return parseRoadmap(raw);
  } catch {
    return { intro: "The roadmap file is missing from this deployment.", sections: [] };
  }
}

export default function RoadmapPage() {
    const t = getT();

  const { intro, sections } = loadRoadmap();

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <span className="eyebrow">{t("auto.page.roadmap")}</span>
          <h1>
            {t("auto.page.what_apos_s")} <span className="grad">{t("auto.page.done")}</span> {t("auto.page._amp_what_apos_s")}{" "}
            <span className="grad">{t("auto.page.coming")}</span>.
          </h1>
          <p className="muted">
            {t("auto.page.the_live_development_roadmap_o")}
                                </p>
        </div>
      </section>

      <RoadmapClient intro={intro} sections={sections} />
    </>
  );
}
