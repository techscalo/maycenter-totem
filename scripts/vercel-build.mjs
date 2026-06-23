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

// Vercel's Build Output API (launcherType Nodejs) invokes this as a Node
// (req, res) handler. Adapt it to the Web fetch handler the TanStack Start bundle
// expects: build an absolute-URL Request from the Node request, run it, then stream
// the Response back. set-cookie is handled separately so multiple cookies survive.
writeFileSync(
  `${fnDir}/index.mjs`,
  [
    "import handler from './server.js';",
    "import { Readable } from 'node:stream';",
    "",
    "export default async function (req, res) {",
    "  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';",
    "  const proto = req.headers['x-forwarded-proto'] || 'https';",
    "  const url = `${proto}://${host}${req.url}`;",
    "",
    "  const headers = new Headers();",
    "  for (const [k, v] of Object.entries(req.headers)) {",
    "    if (Array.isArray(v)) for (const x of v) headers.append(k, x);",
    "    else if (v != null) headers.set(k, v);",
    "  }",
    "",
    "  const method = req.method || 'GET';",
    "  const hasBody = method !== 'GET' && method !== 'HEAD';",
    "  const request = new Request(url, {",
    "    method,",
    "    headers,",
    "    body: hasBody ? Readable.toWeb(req) : undefined,",
    "    duplex: hasBody ? 'half' : undefined,",
    "  });",
    "",
    "  const response = await handler.fetch(request, process.env, {});",
    "",
    "  res.statusCode = response.status;",
    "  for (const [key, value] of response.headers) {",
    "    if (key.toLowerCase() === 'set-cookie') continue;",
    "    res.setHeader(key, value);",
    "  }",
    "  const cookies = response.headers.getSetCookie?.() ?? [];",
    "  if (cookies.length) res.setHeader('set-cookie', cookies);",
    "",
    "  if (response.body) Readable.fromWeb(response.body).pipe(res);",
    "  else res.end();",
    "}",
    "",
  ].join("\n"),
);

// The bundle is ESM (.js with import/export). Vercel extracts only this folder to
// /var/task without the repo root package.json, so Node would treat .js as CJS and
// crash ("Cannot use import statement outside a module"). Mark the folder as ESM.
writeFileSync(`${fnDir}/package.json`, JSON.stringify({ type: "module" }) + "\n");

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
