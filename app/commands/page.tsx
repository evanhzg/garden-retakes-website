import fs from "node:fs";
import path from "node:path";
import CommandsClient, { CommandCategory, CommandItem } from "./CommandsClient";

export const metadata = {
  title: "Commands — Garden Retakes",
  description: "Every chat and console command available on the Garden Retakes server.",
};

export const dynamic = "force-static";

function parseCommands(markdown: string) {
  const lines = markdown.split("\n");
  const categories: CommandCategory[] = [];
  let currentCategory: CommandCategory | null = null;
  let intro = "";
  let parsingTable = false;
  let tableHeaders: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("## ")) {
      currentCategory = {
        name: line.replace("## ", "").trim(),
        description: "",
        commands: [],
      };
      categories.push(currentCategory);
      parsingTable = false;
      continue;
    }

    if (!currentCategory) {
      if (!line.startsWith("# ")) {
        intro += line + "\n";
      }
      continue;
    }

    if (line.trim().startsWith("|")) {
      const parts = line
        .split("|")
        .map((s) => s.trim())
        .filter((s, idx, arr) => !(idx === 0 && s === "") && !(idx === arr.length - 1 && s === ""));

      if (!parsingTable) {
        if (parts.some((p) => p.includes("---"))) {
          parsingTable = true;
        } else {
          tableHeaders = parts.map((p) => p.toLowerCase());
        }
      } else {
        if (parts.some((p) => p.includes("---"))) continue;

        const cmdObj: CommandItem = { command: "", description: "" };
        parts.forEach((part, index) => {
          const header = tableHeaders[index];
          if (header === "command") cmdObj.command = part;
          else if (header === "level") cmdObj.level = part;
          else if (header === "description") cmdObj.description = part;
        });
        currentCategory.commands.push(cmdObj);
      }
    } else {
      if (!parsingTable && line.trim() !== "") {
        currentCategory.description += line + "\n";
      } else if (parsingTable && line.trim() !== "") {
        currentCategory.description += line + "\n";
      }
    }
  }

  return { intro: intro.trim(), categories };
}

function loadCommands() {
  const filePath = path.join(process.cwd(), "content", "commands.md");
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return parseCommands(raw);
  } catch {
    return { intro: "The commands file is missing from this deployment.", categories: [] };
  }
}

export default function CommandsPage() {
  const { intro, categories } = loadCommands();

  return (
    <>
      <section className="hero hero-compact">
        <div className="hero-inner">
          <span className="eyebrow">Commands</span>
          <h1>
            Every <span className="grad">command</span> on the server.
          </h1>
          <p className="muted">
            Chat commands work with <code>!</code> or <code>/</code>; each also exists in
            console as <code>css_*</code>. Mirrored from the plugin&apos;s COMMANDS.md.
          </p>
        </div>
      </section>

      <CommandsClient intro={intro} categories={categories} />
    </>
  );
}
