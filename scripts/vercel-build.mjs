// Vercel Build Output API v3 builder for this TanStack Start app.
// The repo's native target is Cloudflare Workers; on Vercel we instead emit a
// node-targeted SSR bundle and wrap its `fetch` handler as a serverless function.
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, writeFileSync, rmSync } from "node:fs";

const OUT = ".vercel/output";

rmSync(OUT, { recursive: true, force: true });

// VERCEL=1 makes vite.config skip the Cloudflare plugin -> plain node SSR build.
execSync("npx vite build", { stdio: "inherit", env: { ...process.env, VERCEL: "1" } });

// Static client assets (no index.html: app is SSR, served by the function fallthrough).
mkdirSync(`${OUT}/static`, { recursive: true });
cpSync("dist/client", `${OUT}/static`, { recursive: true });

// Serverless function: the TanStack Start fetch handler.
const fnDir = `${OUT}/functions/_server.func`;
mkdirSync(fnDir, { recursive: true });
cpSync("dist/server", fnDir, { recursive: true });

writeFileSync(
  `${fnDir}/index.mjs`,
  "import handler from './server.js';\n" +
    "export default (request) => handler.fetch(request, process.env, {});\n",
);

writeFileSync(
  `${fnDir}/.vc-config.json`,
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "index.mjs",
      launcherType: "Nodejs",
      supportsResponseStreaming: true,
    },
    null,
    2,
  ),
);

// Serve real files first, then hand everything else to the SSR function.
writeFileSync(
  `${OUT}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [{ handle: "filesystem" }, { src: "/(.*)", dest: "/_server" }],
    },
    null,
    2,
  ),
);

console.log("Vercel Build Output ready at .vercel/output");
