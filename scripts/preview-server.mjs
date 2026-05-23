import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.cwd(), "out");
const preferredPort = Number(process.env.PORT || 4173);
const host = "127.0.0.1";
const composeApiOrigin = process.env.COMPOSE_API_ORIGIN || "http://127.0.0.1:4174";

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".map", "application/json; charset=utf-8"]
]);

function resolveRoute(url) {
  const parsed = new URL(url || "/", `http://${host}`);
  let pathname = decodeURIComponent(parsed.pathname);

  if (pathname === "/" || pathname === "/studio") {
    pathname = "/studio.html";
  }
  if (pathname === "/admin") {
    pathname = "/admin.html";
  }

  const target = path.resolve(root, `.${pathname.replace(/\//g, path.sep)}`);
  if (!target.startsWith(root)) {
    return null;
  }
  return target;
}

function proxyApiRequest(req, res) {
  const target = new URL(req.url || "/", composeApiOrigin);
  const headers = {
    ...req.headers,
    host: target.host
  };

  const proxy = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: req.method,
      headers
    },
    (apiRes) => {
      res.writeHead(apiRes.statusCode ?? 502, apiRes.headers);
      apiRes.pipe(res);
    }
  );

  proxy.on("error", (error) => {
    res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        error: `Compose API unavailable at ${composeApiOrigin}: ${error.message}`
      })
    );
  });

  req.pipe(proxy);
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/")) {
      proxyApiRequest(req, res);
      return;
    }

    const target = resolveRoute(req.url);
    if (!target) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    const stat = await fs.stat(target).catch(() => null);
    if (!stat || stat.isDirectory()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const data = await fs.readFile(target);
    res.writeHead(200, {
      "cache-control": "no-store",
      "content-type": mimeTypes.get(path.extname(target).toLowerCase()) || "application/octet-stream"
    });
    res.end(data);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(error instanceof Error ? error.stack : String(error));
  }
});

server.listen(preferredPort, host, () => {
  if (process.env.QUIET !== "1") {
    console.log(`Preview server: http://${host}:${preferredPort}/studio.html`);
    console.log(`Admin console:   http://${host}:${preferredPort}/admin.html`);
  }
});
