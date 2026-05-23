const DB_NAME = "frameforge-record-media";
const DB_VERSION = 1;
const STORE = "blobs";

type MediaKind = "clip" | "export";

function clipKey(recordId: string, sceneId: string) {
  return `clip:${recordId}:${sceneId}`;
}

function exportKey(recordId: string) {
  return `export:${recordId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前环境不支持 IndexedDB"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error("无法打开 IndexedDB"));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
  });
}

async function putBlob(key: string, blob: Blob) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("写入 IndexedDB 失败"));
    tx.objectStore(STORE).put(blob, key);
  });
}

async function getBlob(key: string): Promise<Blob | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    tx.onerror = () => reject(tx.error ?? new Error("读取 IndexedDB 失败"));
    const request = tx.objectStore(STORE).get(key);
    request.onsuccess = () => {
      db.close();
      resolve((request.result as Blob | undefined) ?? null);
    };
    request.onerror = () => reject(request.error ?? new Error("读取 IndexedDB 失败"));
  });
}

async function deleteKey(key: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error("删除 IndexedDB 失败"));
    tx.objectStore(STORE).delete(key);
  });
}

export async function saveClipBlob(recordId: string, sceneId: string, blob: Blob) {
  await putBlob(clipKey(recordId, sceneId), blob);
}

export async function loadClipBlob(recordId: string, sceneId: string) {
  return getBlob(clipKey(recordId, sceneId));
}

export async function deleteClipBlob(recordId: string, sceneId: string) {
  await deleteKey(clipKey(recordId, sceneId));
}

export async function saveExportBlob(recordId: string, blob: Blob) {
  await putBlob(exportKey(recordId), blob);
}

export async function loadExportBlob(recordId: string) {
  return getBlob(exportKey(recordId));
}

export async function deleteExportBlob(recordId: string) {
  await deleteKey(exportKey(recordId));
}

export async function deleteAllRecordBlobs(recordId: string, sceneIds: string[]) {
  await Promise.all([
    ...sceneIds.map((sceneId) => deleteClipBlob(recordId, sceneId)),
    deleteExportBlob(recordId)
  ]);
}

export async function copyRecordBlobs(sourceRecordId: string, targetRecordId: string, sceneIds: string[]) {
  for (const sceneId of sceneIds) {
    const blob = await loadClipBlob(sourceRecordId, sceneId);
    if (blob) {
      await saveClipBlob(targetRecordId, sceneId, blob);
    }
  }
  const exportBlob = await loadExportBlob(sourceRecordId);
  if (exportBlob) {
    await saveExportBlob(targetRecordId, exportBlob);
  }
}

function waitForVideoEvent(video: HTMLVideoElement, event: "loadedmetadata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      video.removeEventListener(event, done);
      video.removeEventListener("error", failed);
      resolve();
    };
    const failed = () => {
      video.removeEventListener(event, done);
      video.removeEventListener("error", failed);
      reject(new Error("无法读取视频帧"));
    };
    video.addEventListener(event, done, { once: true });
    video.addEventListener("error", failed, { once: true });
  });
}

/** 从视频文件或 URL 截取封面，返回 JPEG data URL */
export async function captureVideoThumbnail(source: File | string, width = 128, height = 72): Promise<string> {
  const video = document.createElement("video");
  const objectUrl = typeof source === "string" ? source : URL.createObjectURL(source);
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  try {
    await waitForVideoEvent(video, "loadedmetadata");
    const seekTime =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.min(Math.max(video.duration * 0.12, 0.1), video.duration - 0.05)
        : 0.1;
    video.currentTime = seekTime;
    await waitForVideoEvent(video, "seeked");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("无法创建画布");
    }

    const vw = video.videoWidth || width;
    const vh = video.videoHeight || height;
    const scale = Math.max(width / vw, height / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(video, (width - dw) / 2, (height - dh) / 2, dw, dh);
    return canvas.toDataURL("image/jpeg", 0.62);
  } finally {
    if (typeof source !== "string") {
      URL.revokeObjectURL(objectUrl);
    }
    video.removeAttribute("src");
    video.load();
  }
}
