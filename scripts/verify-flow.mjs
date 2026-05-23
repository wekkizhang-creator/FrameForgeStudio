import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const results = [];
const children = [];

function logResult(status, name, detail = "") {
  results.push({ status, name, detail });
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`${status.padEnd(4)} ${name}${suffix}`);
}

async function step(name, fn) {
  try {
    await fn();
    logResult("PASS", name);
  } catch (error) {
    logResult("FAIL", name, error instanceof Error ? error.message : String(error));
  }
}

function skip(name, reason) {
  logResult("SKIP", name, reason);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function waitForJson(url, timeoutMs = 12000) {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { headers: { "cache-control": "no-store" } });
      if (response.ok) {
        return await response.json();
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function waitForOk(url, timeoutMs = 12000) {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { headers: { "cache-control": "no-store" } });
      if (response.ok) {
        return response;
      }
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

function commandExists(command) {
  const result = spawnSync(command, ["-version"], {
    stdio: "ignore",
    windowsHide: true
  });
  return !result.error && result.status === 0;
}

function startNode(script, env) {
  const child = spawn(process.execPath, [script], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  children.push(child);
  return child;
}

async function readBuiltJavaScript() {
  const chunksRoot = path.join(root, "out", "_next", "static", "chunks");
  const parts = [];

  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.name.endsWith(".js")) {
        parts.push(await readFile(fullPath, "utf8"));
      }
    }
  }

  await walk(chunksRoot);
  return parts.join("\n");
}

async function makeVideo(filePath, color) {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-t",
      "0.8",
      "-i",
      `color=c=${color}:s=320x180:r=24`,
      "-f",
      "lavfi",
      "-t",
      "0.8",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      filePath
    ],
    { stdio: "pipe", windowsHide: true }
  );
  assert(result.status === 0, result.stderr.toString("utf8") || "ffmpeg failed");
}

async function verifyMp4Compose(baseUrl) {
  if (!commandExists("ffmpeg") || !commandExists("ffprobe")) {
    skip("MP4 compose E2E", "ffmpeg/ffprobe not found on this machine");
    return;
  }

  await step("MP4 compose E2E", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "frameforge-flow-"));
    try {
      const clipA = path.join(tempDir, "a.mp4");
      const clipB = path.join(tempDir, "b.mp4");
      const output = path.join(tempDir, "out.mp4");

      await makeVideo(clipA, "red");
      await makeVideo(clipB, "blue");

      const payload = {
        ratio: "16:9",
        exportProfile: "MP4 720P",
        scenes: [
          { id: "verify-a", index: 1, title: "A", narration: "", duration: 0.8, trimStart: 0, trimEnd: 0.8 },
          { id: "verify-b", index: 2, title: "B", narration: "", duration: 0.8, trimStart: 0, trimEnd: 0.8 }
        ]
      };
      const form = new FormData();
      form.append("payload", JSON.stringify(payload));
      form.append("clip:verify-a", new Blob([await readFile(clipA)], { type: "video/mp4" }), "a.mp4");
      form.append("clip:verify-b", new Blob([await readFile(clipB)], { type: "video/mp4" }), "b.mp4");

      const response = await fetch(`${baseUrl}/api/local-compose`, {
        method: "POST",
        body: form
      });
      assert(response.status === 200, `expected 200, got ${response.status}: ${await response.text()}`);
      assert((response.headers.get("content-type") ?? "").includes("video/mp4"), "response is not video/mp4");

      const buffer = Buffer.from(await response.arrayBuffer());
      assert(buffer.length > 1000, `MP4 response too small: ${buffer.length}`);
      await writeFile(output, buffer);

      const probe = spawnSync(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=format_name,duration", "-of", "default=nw=1", output],
        { stdio: "pipe", windowsHide: true }
      );
      assert(probe.status === 0, probe.stderr.toString("utf8") || "ffprobe failed");
      const probeText = probe.stdout.toString("utf8");
      assert(probeText.includes("format_name=mov,mp4"), `unexpected format: ${probeText}`);
      const duration = Number(probeText.match(/duration=([0-9.]+)/)?.[1] ?? 0);
      assert(duration >= 1.2, `unexpected duration: ${duration}`);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
}

async function main() {
  const outStudio = path.join(root, "out", "studio.html");
  const outAdmin = path.join(root, "out", "admin.html");

  await step("Build artifacts exist", async () => {
    assert((await readFile(outStudio, "utf8")).includes("<!DOCTYPE html"), "out/studio.html missing or invalid");
    assert((await readFile(outAdmin, "utf8")).includes("<!DOCTYPE html"), "out/admin.html missing or invalid");
  });

  const composePort = await freePort();
  const previewPort = await freePort();
  const composeBase = `http://127.0.0.1:${composePort}`;
  const previewBase = `http://127.0.0.1:${previewPort}`;

  startNode("server/local-compose-api.mjs", {
    PORT: String(composePort),
    FRAMEFORGE_WORK_DIR: path.join(os.tmpdir(), `frameforge-compose-${composePort}`)
  });
  await step("Compose API health", async () => {
    const health = await waitForJson(`${composeBase}/api/health`);
    assert(health.ok === true, "health payload missing ok=true");
  });

  startNode("scripts/preview-server.mjs", {
    PORT: String(previewPort),
    COMPOSE_API_ORIGIN: composeBase,
    QUIET: "1"
  });
  await step("Preview routes", async () => {
    for (const route of ["/", "/studio", "/studio.html", "/admin", "/admin.html"]) {
      const response = await waitForOk(`${previewBase}${route}`);
      assert((response.headers.get("content-type") ?? "").includes("text/html"), `${route} is not html`);
    }
  });

  await step("Preview path traversal guard", async () => {
    const response = await fetch(`${previewBase}/%2e%2e/package.json`);
    assert(response.status === 403 || response.status === 404, `expected 403/404, got ${response.status}`);
  });

  await step("Preview API proxy", async () => {
    const health = await waitForJson(`${previewBase}/api/health`);
    assert(health.service === "frameforge-local-compose", "proxy did not reach compose API");
  });

  await step("Studio critical UI strings are bundled", async () => {
    const js = await readBuiltJavaScript();
    for (const text of ["四步流程", "提示词直出视频", "上传视频处理", "选择多个本地视频", "按上传顺序写入时间轴"]) {
      assert(js.includes(text), `missing bundled text: ${text}`);
    }
  });

  await step("No fake upload URI in schema renderer", async () => {
    const source = await readFile(path.join(root, "components", "schema-parameter-form.tsx"), "utf8");
    assert(!source.includes("mock://"), "schema renderer still creates mock:// values");
  });

  await verifyMp4Compose(previewBase);

  const failed = results.filter((item) => item.status === "FAIL");
  const skipped = results.filter((item) => item.status === "SKIP");
  console.log("");
  console.log(`Flow verification complete: ${results.length - failed.length - skipped.length} passed, ${skipped.length} skipped, ${failed.length} failed.`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  for (const child of children) {
    child.kill();
  }
}
