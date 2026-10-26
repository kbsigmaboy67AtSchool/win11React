/**
 * Virtual File System layer for Win11React
 * Backed by encrypted IDB (accounts.js). Supports folders, files, ZIP, large blobs.
 * Designed so File Explorer, Browser, and future Editor all share the same tree.
 */

import accounts from "./accounts.js";

const ROOT = "/";
const USER_HOME = "/Users/Default"; // will be per-account later
const DESKTOP = "/Users/Default/Desktop";
const DOCUMENTS = "/Users/Default/Documents";
const DOWNLOADS = "/Users/Default/Downloads";
const PICTURES = "/Users/Default/Pictures";
const MUSIC = "/Users/Default/Music";
const VIDEOS = "/Users/Default/Videos";

const SPECIAL = {
  "%user%": USER_HOME,
  "%desktop%": DESKTOP,
  "%documents%": DOCUMENTS,
  "%downloads%": DOWNLOADS,
  "%pictures%": PICTURES,
  "%music%": MUSIC,
  "%videos%": VIDEOS,
};

function normalize(path) {
  if (!path || path === ".") return ROOT;
  path = path.replace(/\\/g, "/");
  if (SPECIAL[path]) path = SPECIAL[path];
  // Resolve ./ and ../
  const parts = path.split("/").filter(Boolean);
  const stack = [];
  for (const p of parts) {
    if (p === ".") continue;
    if (p === "..") stack.pop();
    else stack.push(p);
  }
  return "/" + stack.join("/");
}

function parentOf(path) {
  path = normalize(path);
  if (path === ROOT) return null;
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? "/" + parts.join("/") : ROOT;
}

function nameOf(path) {
  path = normalize(path);
  if (path === ROOT) return "";
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

/** Ensure standard Windows-like folders exist for current account */
export async function ensureDefaultTree() {
  if (!accounts.isUnlocked()) return;
  const folders = [
    ROOT,
    "/Users",
    USER_HOME,
    DESKTOP,
    DOCUMENTS,
    DOWNLOADS,
    PICTURES,
    MUSIC,
    VIDEOS,
    "/Program Files",
    "/Windows",
  ];
  for (const p of folders) {
    const existing = await accounts.getFileRecord(p);
    if (!existing) {
      await accounts.putFileRecord({
        path: p,
        name: nameOf(p) || "This PC",
        parent: parentOf(p),
        type: "folder",
        size: 0,
        modified: Date.now(),
        created: Date.now(),
      });
    }
  }
}

export async function mkdir(path, recursive = true) {
  path = normalize(path);
  if (path === ROOT) return;
  const parent = parentOf(path);
  if (recursive && parent && parent !== ROOT) {
    const pRec = await accounts.getFileRecord(parent);
    if (!pRec) await mkdir(parent, true);
  }
  const existing = await accounts.getFileRecord(path);
  if (existing) {
    if (existing.type !== "folder") throw new Error("Path exists and is not a folder");
    return existing;
  }
  const rec = {
    path,
    name: nameOf(path),
    parent,
    type: "folder",
    size: 0,
    modified: Date.now(),
    created: Date.now(),
  };
  await accounts.putFileRecord(rec);
  return rec;
}

export async function writeFile(path, content, mime = "application/octet-stream") {
  path = normalize(path);
  const parent = parentOf(path);
  if (parent) {
    const pRec = await accounts.getFileRecord(parent);
    if (!pRec) await mkdir(parent, true);
  }

  let size = 0;
  let blobId = null;
  let textPreview = null;

  if (typeof content === "string") {
    size = new TextEncoder().encode(content).byteLength;
    // Small text kept in record; large goes to blob
    if (size < 256 * 1024) {
      textPreview = content;
    } else {
      blobId = "blob_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      await accounts.putBlob(blobId, new TextEncoder().encode(content));
    }
  } else {
    // ArrayBuffer / Uint8Array
    const u8 = content instanceof Uint8Array ? content : new Uint8Array(content);
    size = u8.byteLength;
    blobId = "blob_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    await accounts.putBlob(blobId, u8);
  }

  const rec = {
    path,
    name: nameOf(path),
    parent,
    type: "file",
    size,
    mime,
    blobId,
    text: textPreview,
    modified: Date.now(),
    created: Date.now(),
  };
  await accounts.putFileRecord(rec);
  return rec;
}

export async function readFile(path, asText = false) {
  path = normalize(path);
  const rec = await accounts.getFileRecord(path);
  if (!rec || rec.type !== "file") throw new Error("File not found: " + path);

  if (rec.text != null) {
    return asText ? rec.text : new TextEncoder().encode(rec.text);
  }
  if (rec.blobId) {
    const data = await accounts.getBlob(rec.blobId);
    if (!data) throw new Error("Blob missing for " + path);
    return asText ? new TextDecoder().decode(data) : data;
  }
  throw new Error("No content for " + path);
}

export async function readdir(path) {
  path = normalize(path);
  const children = await accounts.listChildren(path);
  // Sort folders first, then by name (Windows-like)
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return children;
}

export async function stat(path) {
  path = normalize(path);
  return accounts.getFileRecord(path);
}

export async function exists(path) {
  return !!(await stat(path));
}

export async function unlink(path) {
  path = normalize(path);
  const rec = await accounts.getFileRecord(path);
  if (!rec) return;
  if (rec.type === "folder") {
    const kids = await readdir(path);
    for (const k of kids) await unlink(k.path);
  }
  if (rec.blobId) {
    // blob delete left for later (IDB delete)
  }
  
  // Direct delete via put with tombstone or we need a delete API
  // For now we mark deleted
  await accounts.deleteFileRecord(path);
}

export function resolveRelative(baseDir, rel) {
  if (!rel || rel.startsWith("/") || /^[a-z]+:/i.test(rel)) return normalize(rel);
  // Support ./ and ../ relative to the folder of the opened file
  return normalize(baseDir.replace(/\/[^/]*$/, "") + "/" + rel);
}

export { normalize, parentOf, nameOf, SPECIAL, ROOT, DESKTOP, DOCUMENTS, DOWNLOADS };

export default {
  ensureDefaultTree,
  mkdir,
  writeFile,
  readFile,
  readdir,
  stat,
  exists,
  unlink,
  resolveRelative,
  normalize,
  SPECIAL,
};
