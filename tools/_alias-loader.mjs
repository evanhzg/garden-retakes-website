/**
 * Let plain node import the app's TypeScript modules.
 *
 * The physics libraries are shared between the browser and the command-line
 * tools that score them, and that sharing is the point: a scoring tool with its
 * own copy of the simulator scores its copy, and the two drift the first time
 * somebody fixes one of them.
 *
 * Two things node needs teaching, both of which are TypeScript conventions
 * rather than JavaScript ones:
 *
 *   `@/lib/foo`  — the alias from tsconfig's paths, which Next resolves and
 *                  node has never heard of.
 *   `./foo`      — extensionless relative imports. TypeScript allows them;
 *                  node's ESM resolver requires the extension.
 *
 * Node 23+ strips the types itself, so nothing else is needed and no dependency
 * is involved.
 */
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = pathToFileURL(path.resolve(import.meta.dirname, "..") + path.sep).href;

// Async, and awaiting next(): the hook returns a promise, so a synchronous
// try/catch around it never sees the rejection and the fallback below would be
// dead code that looked like it worked.
export async function resolve(specifier, context, next) {
  const target = specifier.startsWith("@/")
    ? new URL(specifier.slice(2), ROOT).href
    : specifier;

  try {
    return await next(target, context);
  } catch (err) {
    if (err?.code !== "ERR_MODULE_NOT_FOUND") throw err;

    // Extensionless: try the extensions TypeScript would have.
    for (const extension of [".ts", ".tsx", ".js", "/index.ts"]) {
      const candidate = new URL(target + extension, context.parentURL ?? ROOT);
      if (existsSync(fileURLToPath(candidate))) {
        return next(candidate.href, context);
      }
    }

    throw err;
  }
}

/**
 * JSON imports.
 *
 * Bundlers add `with { type: "json" }` implicitly; node requires it in the
 * source. The app's modules are written for the bundler — `import overviews
 * from "@/data/mapOverviews.json"` — and rewriting them to satisfy a tool would
 * be the tool dictating to the application.
 */
export async function load(url, context, next) {
  if (url.endsWith(".json") && !context.importAttributes?.type) {
    return next(url, { ...context, importAttributes: { ...context.importAttributes, type: "json" } });
  }
  return next(url, context);
}
