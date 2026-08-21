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
 * And the types themselves. This used to say "Node 23+ strips them, so no
 * dependency is involved", which was true of the machine it was written on and
 * of nothing else: a Node built without TypeScript support answers `.mts` with
 * ERR_UNKNOWN_FILE_EXTENSION, or ERR_NO_TYPESCRIPT if you ask it to strip them,
 * and every one of these tests fails before its first assertion. That is how
 * the whole suite came to be silently unrunnable. It now transpiles with the
 * TypeScript the repository already depends on, and only when node cannot do it
 * — so a node that can keeps doing it, and one that cannot stops being a reason
 * the tests do not run.
 */
import { pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

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

  // Query and hash stripped first: rcon.test.mts imports
  // `@/lib/rcon.ts?<random>` to defeat the module cache between cases, so the
  // extension is not at the end of the URL and an anchored test misses it.
  const filePath = url.split("?")[0].split("#")[0];

  if (/\.(m?ts|tsx)$/.test(filePath)) {
    // Let node have first refusal: where it can strip types, its own
    // implementation is the one these files were written against.
    try {
      return await next(url, context);
    } catch (err) {
      if (err?.code !== "ERR_UNKNOWN_FILE_EXTENSION" && err?.code !== "ERR_NO_TYPESCRIPT") {
        throw err;
      }
    }

    const source = readFileSync(fileURLToPath(filePath), "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: fileURLToPath(filePath),
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        // ESM out, always: these run as modules and import each other as
        // modules, and CommonJS output would break at the first `import`.
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.ReactJSX,
        // Types only — no downlevelling, no helpers, nothing that would make
        // the code under test differ from the code that ships.
        isolatedModules: true,
        verbatimModuleSyntax: false,
      },
    });

    return { format: "module", source: outputText, shortCircuit: true };
  }

  return next(url, context);
}
