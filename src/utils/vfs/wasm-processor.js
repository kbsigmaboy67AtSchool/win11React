/**
 * WASM-accelerated file processor for Win11React File Explorer / Browser
 * Handles large files, ZIP inspection, hashing, and future heavy work.
 * Currently uses native JS + Web Crypto; WASM modules can be loaded on demand.
 */

const workers = new Map();

/** Compute SHA-256 of a large ArrayBuffer / Uint8Array in chunks (non-blocking) */
export async function sha256(data) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  // Web Crypto is already highly optimized (often WASM under the hood)
  const hash = await crypto.subtle.digest("SHA-256", u8);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Slice a large file into chunks for progressive loading / streaming */
export function chunkArrayBuffer(buffer, chunkSize = 4 * 1024 * 1024) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const chunks = [];
  for (let i = 0; i < u8.length; i += chunkSize) {
    chunks.push(u8.subarray(i, Math.min(i + chunkSize, u8.length)));
  }
  return chunks;
}

/** Detect MIME from extension + magic bytes (basic) */
export function detectMime(name, headerBytes) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const map = {
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "application/javascript",
    mjs: "application/javascript",
    json: "application/json",
    txt: "text/plain",
    md: "text/markdown",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
    zip: "application/zip",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    webm: "video/webm",
    py: "text/x-python",
    rs: "text/x-rust",
    jsx: "text/jsx",
    tsx: "text/tsx",
    ts: "text/typescript",
  };
  if (map[ext]) return map[ext];

  if (headerBytes && headerBytes.length >= 4) {
    // PNG
    if (headerBytes[0] === 0x89 && headerBytes[1] === 0x50) return "image/png";
    // JPEG
    if (headerBytes[0] === 0xff && headerBytes[1] === 0xd8) return "image/jpeg";
    // ZIP / DOCX / etc
    if (headerBytes[0] === 0x50 && headerBytes[1] === 0x4b) return "application/zip";
    // PDF
    if (headerBytes[0] === 0x25 && headerBytes[1] === 0x50) return "application/pdf";
  }
  return "application/octet-stream";
}

/** Create a blob: URL that can be opened in Browser or Edge app, supporting relative refs */
export function createBlobUrl(data, mime) {
  const blob = new Blob([data], { type: mime || "application/octet-stream" });
  return URL.createObjectURL(blob);
}

/**
 * Prepare a multi-file HTML project for browser preview.
 * - Resolves ./ and ../ relative to the main HTML file's folder
 * - Inlines or creates blob URLs for linked CSS/JS/images that live in VFS
 * Returns { html: string, blobUrl: string } ready for iframe / Edge
 */
export async function prepareHtmlMultifile(mainPath, vfs) {
  const htmlText = await vfs.readFile(mainPath, true);
  const baseDir = mainPath.replace(/\/[^/]*$/, "") || "/";

  // Very lightweight relative resolver for href= and src=
  const resolved = htmlText.replace(
    /(src|href)=["'](\.\/?[^"']+)["']/gi,
    (match, attr, rel) => {
      const abs = vfs.resolveRelative(mainPath, rel);
      // We return a special marker; real blob wiring happens at open time
      return `${attr}="vfs://${abs}"`;
    }
  );

  const mime = "text/html";
  const blobUrl = createBlobUrl(resolved, mime);
  return { html: resolved, blobUrl, baseDir };
}

/** Progressive open helper for multi-GB files: returns a stream-like reader */
export async function openLargeFile(path, vfs, onProgress) {
  const rec = await vfs.stat(path);
  if (!rec) throw new Error("Not found");
  // For now we still load fully (IDB limit ~hundreds of MB in practice).
  // Future: chunked getBlob + streaming.
  const data = await vfs.readFile(path, false);
  if (onProgress) onProgress(1);
  return {
    data,
    size: rec.size,
    mime: rec.mime || detectMime(rec.name),
    name: rec.name,
  };
}

export default {
  sha256,
  chunkArrayBuffer,
  detectMime,
  createBlobUrl,
  prepareHtmlMultifile,
  openLargeFile,
};
