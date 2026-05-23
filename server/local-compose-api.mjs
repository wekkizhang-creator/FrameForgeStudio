import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const port = Number(process.env.PORT || 4174);
const maxUploadBytes = Number(process.env.MAX_UPLOAD_MB || 512) * 1024 * 1024;
const workRoot = process.env.FRAMEFORGE_WORK_DIR || path.join(tmpdir(), "frameforge-compose");

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sanitizeName(value) {
  return String(value || "upload").replace(/[^\w.-]+/g, "_").slice(0, 96);
}

function parseContentDisposition(value = "") {
  const result = {};
  value.split(";").forEach((part) => {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey || !rawValue.length) {
      return;
    }
    result[rawKey.toLowerCase()] = rawValue.join("=").replace(/^"|"$/g, "");
  });
  return result;
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxUploadBytes) {
      const error = new Error(`上传文件过大，当前限制为 ${Math.round(maxUploadBytes / 1024 / 1024)}MB。`);
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function parseMultipartForm(request, body, tempDir) {
  const contentType = request.headers["content-type"] || "";
  const boundary = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[1] ?? contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)?.[2];

  if (!boundary) {
    const error = new Error("请求缺少 multipart boundary。");
    error.statusCode = 400;
    throw error;
  }

  const marker = Buffer.from(`--${boundary}`);
  const headerBreak = Buffer.from("\r\n\r\n");
  const fields = new Map();
  const files = new Map();
  let cursor = body.indexOf(marker);

  while (cursor !== -1) {
    cursor += marker.length;

    if (body[cursor] === 45 && body[cursor + 1] === 45) {
      break;
    }
    if (body[cursor] === 13 && body[cursor + 1] === 10) {
      cursor += 2;
    }

    const headerEnd = body.indexOf(headerBreak, cursor);
    if (headerEnd === -1) {
      break;
    }

    const nextMarker = body.indexOf(marker, headerEnd + headerBreak.length);
    if (nextMarker === -1) {
      break;
    }

    let partEnd = nextMarker;
    if (body[partEnd - 2] === 13 && body[partEnd - 1] === 10) {
      partEnd -= 2;
    }

    const rawHeaders = body.subarray(cursor, headerEnd).toString("latin1");
    const headers = Object.fromEntries(
      rawHeaders
        .split("\r\n")
        .map((line) => {
          const index = line.indexOf(":");
          return index === -1 ? null : [line.slice(0, index).toLowerCase(), line.slice(index + 1).trim()];
        })
        .filter(Boolean)
    );
    const disposition = parseContentDisposition(headers["content-disposition"]);
    const name = disposition.name;
    const filename = disposition.filename;
    const partBody = body.subarray(headerEnd + headerBreak.length, partEnd);

    if (name && filename) {
      const safeName = `${randomUUID()}-${sanitizeName(filename)}`;
      const filePath = path.join(tempDir, safeName);
      await writeFile(filePath, partBody);
      files.set(name, {
        path: filePath,
        filename,
        mimeType: headers["content-type"] || "application/octet-stream",
        size: partBody.length
      });
    } else if (name) {
      fields.set(name, partBody.toString("utf8"));
    }

    cursor = nextMarker;
  }

  return { fields, files };
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");
      const errorOutput = Buffer.concat(stderr).toString("utf8");
      if (code === 0) {
        resolve({ stdout: output, stderr: errorOutput });
        return;
      }
      reject(new Error(`${command} exited with ${code}: ${errorOutput || output}`));
    });
  });
}

async function hasAudioTrack(filePath) {
  try {
    const { stdout } = await run("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "csv=p=0",
      filePath
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function getTargetSize(payload) {
  const vertical = payload.ratio !== "16:9";
  const profile = String(payload.exportProfile || "");

  if (profile.includes("8K")) {
    return vertical ? { width: 4320, height: 7680 } : { width: 7680, height: 4320 };
  }
  if (profile.includes("4K")) {
    return vertical ? { width: 2160, height: 3840 } : { width: 3840, height: 2160 };
  }
  if (profile.includes("2K")) {
    return vertical ? { width: 1440, height: 2560 } : { width: 2560, height: 1440 };
  }
  if (profile.includes("1080")) {
    return vertical ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
  }

  if (vertical) {
    return { width: 720, height: 1280 };
  }

  return { width: 1280, height: 720 };
}

function safeDuration(scene) {
  const start = Math.max(0, Number(scene.trimStart || 0));
  const end = Number(scene.trimEnd || scene.duration || 5);
  return {
    start,
    duration: Math.max(0.4, end - start)
  };
}

function videoFilter(width, height) {
  return `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,fps=30,setsar=1,format=yuv420p`;
}

async function normalizeUploadedClip({ inputPath, outputPath, scene, width, height }) {
  const { start, duration } = safeDuration(scene);
  const hasAudio = await hasAudioTrack(inputPath);
  const commonOutput = [
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-shortest",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-profile:v",
    "main",
    "-level",
    "4.1",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath
  ];

  if (hasAudio) {
    await run("ffmpeg", [
      "-y",
      "-ss",
      String(start),
      "-t",
      String(duration),
      "-i",
      inputPath,
      "-filter_complex",
      `[0:v]${videoFilter(width, height)}[v];[0:a:0]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`,
      ...commonOutput
    ]);
    return;
  }

  await run("ffmpeg", [
    "-y",
    "-ss",
    String(start),
    "-t",
    String(duration),
    "-i",
    inputPath,
    "-f",
    "lavfi",
    "-t",
    String(duration),
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-filter_complex",
    `[0:v]${videoFilter(width, height)}[v];[1:a]aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a]`,
    ...commonOutput
  ]);
}

async function createPlaceholderClip({ outputPath, scene, width, height }) {
  const { duration } = safeDuration(scene);
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-t",
    String(duration),
    "-i",
    `color=c=0x101820:s=${width}x${height}:r=30`,
    "-f",
    "lavfi",
    "-t",
    String(duration),
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-shortest",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-profile:v",
    "main",
    "-level",
    "4.1",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outputPath
  ]);
}

function concatFileLine(filePath) {
  return `file '${filePath.replace(/'/g, "'\\''")}'`;
}

async function buildMp4({ payload, files, tempDir }) {
  const scenes = Array.isArray(payload.scenes) ? payload.scenes : [];
  if (!scenes.length) {
    const error = new Error("时间轴为空，无法合成 MP4。");
    error.statusCode = 400;
    throw error;
  }

  const { width, height } = getTargetSize(payload);
  const segmentPaths = [];

  for (const [index, scene] of scenes.entries()) {
    const segmentPath = path.join(tempDir, `segment-${String(index + 1).padStart(3, "0")}.mp4`);
    const uploaded = files.get(`clip:${scene.id}`);

    if (uploaded) {
      await normalizeUploadedClip({
        inputPath: uploaded.path,
        outputPath: segmentPath,
        scene,
        width,
        height
      });
    } else {
      await createPlaceholderClip({
        outputPath: segmentPath,
        scene,
        width,
        height
      });
    }

    segmentPaths.push(segmentPath);
  }

  const concatPath = path.join(tempDir, "concat.txt");
  const outputPath = path.join(tempDir, "frameforge-compose.mp4");
  await writeFile(concatPath, `${segmentPaths.map(concatFileLine).join("\n")}\n`, "utf8");
  await run("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    outputPath
  ]);

  return outputPath;
}

async function handleCompose(request, response) {
  const tempDir = path.join(workRoot, randomUUID());
  await mkdir(tempDir, { recursive: true });

  try {
    const body = await readRequestBody(request);
    const { fields, files } = await parseMultipartForm(request, body, tempDir);
    const payloadText = fields.get("payload");
    if (!payloadText) {
      const error = new Error("请求缺少 payload。");
      error.statusCode = 400;
      throw error;
    }

    const payload = JSON.parse(payloadText);
    const outputPath = await buildMp4({ payload, files, tempDir });
    const output = await readFile(outputPath);

    response.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": output.length,
      "Content-Disposition": `attachment; filename="frameforge-local-compose-${Date.now()}.mp4"`,
      "Cache-Control": "no-store"
    });
    response.end(output);
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);
    sendJson(response, statusCode, {
      error: error instanceof Error ? error.message : "MP4 合成失败。"
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/api/health") {
    sendJson(response, 200, { ok: true, service: "frameforge-local-compose" });
    return;
  }

  if (request.method === "POST" && request.url === "/api/local-compose") {
    await handleCompose(request, response);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`FrameForge local compose API listening on 127.0.0.1:${port}`);
});
