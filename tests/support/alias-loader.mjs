// Node's native ESM resolver (used by `node --experimental-strip-types
// --test`) has no concept of the "@/*" -> "src/*" path alias that
// tsconfig.json declares for the Next.js build (webpack/Turbopack resolve
// it there, but a plain `node` process does not). Without this hook, any
// source file that imports "@/..." — the project's normal, established
// import style — throws ERR_MODULE_NOT_FOUND the moment a test imports it
// directly, even though `next build`/`next dev` resolve it fine.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const rel = specifier.slice(2);
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(rel);
    const target = new URL(`../../src/${rel}${hasExtension ? "" : ".ts"}`, import.meta.url);
    return nextResolve(target.href, context);
  }
  return nextResolve(specifier, context);
}
