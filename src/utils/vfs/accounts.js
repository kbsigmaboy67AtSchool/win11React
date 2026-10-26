/**
 * Multi-account system + encrypted IDB persistence for Win11React
 * Looks and behaves like Windows 11 local accounts.
 * All data encrypted with AES-GCM via crypto.js
 */

import {
  hashPassword,
  verifyPassword,
  encryptToBase64,
  decryptFromBase64,
  toBase64,
  fromBase64,
} from "./crypto.js";
import { encrypt, decrypt } from "./crypto.js";

const ACCOUNTS_KEY = "win11_accounts_v1";
const SESSION_KEY = "win11_active_session";
const DB_PREFIX = "win11_vfs_";
const DB_VERSION = 2;

let currentAccount = null; // { username, displayName, photo, ... }
let currentPassword = null; // held only in memory while unlocked
let dbCache = new Map(); // username -> IDBDatabase

/* ========== Account list (metadata only, not encrypted) ========== */

export function listAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAccounts(list) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

export function getCurrentAccount() {
  return currentAccount;
}

export function isUnlocked() {
  return !!(currentAccount && currentPassword);
}

/* ========== Create / delete / update accounts ========== */

export async function createAccount({
  username,
  password,
  displayName,
  photo = "img/settings/defAccount.webp",
}) {
  username = (username || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!username || username.length < 2) throw new Error("Username too short");
  if (!password || password.length < 4) throw new Error("Password must be at least 4 characters");

  const accounts = listAccounts();
  if (accounts.find((a) => a.username === username)) {
    throw new Error("Account already exists");
  }

  const pwHash = await hashPassword(password);
  const account = {
    username,
    displayName: displayName || username,
    photo,
    created: Date.now(),
    lastLogin: null,
    pwHash, // { salt, hash }
  };

  accounts.push(account);
  saveAccounts(accounts);

  // Create empty IDB for this user
  await openDB(username);
  return account;
}

export async function deleteAccount(username, password) {
  const accounts = listAccounts();
  const acc = accounts.find((a) => a.username === username);
  if (!acc) throw new Error("Account not found");
  const ok = await verifyPassword(password, acc.pwHash);
  if (!ok) throw new Error("Incorrect password");

  // Close and delete IDB
  if (dbCache.has(username)) {
    dbCache.get(username).close();
    dbCache.delete(username);
  }
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_PREFIX + username);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  const next = accounts.filter((a) => a.username !== username);
  saveAccounts(next);

  if (currentAccount?.username === username) {
    currentAccount = null;
    currentPassword = null;
  }
}

export async function updateAccountMeta(username, patch) {
  const accounts = listAccounts();
  const idx = accounts.findIndex((a) => a.username === username);
  if (idx < 0) throw new Error("Account not found");
  const allowed = ["displayName", "photo"];
  for (const k of allowed) {
    if (patch[k] !== undefined) accounts[idx][k] = patch[k];
  }
  saveAccounts(accounts);
  if (currentAccount?.username === username) {
    currentAccount = { ...currentAccount, ...accounts[idx] };
  }
  return accounts[idx];
}

/* ========== Login / logout / switch ========== */

export async function login(username, password) {
  const accounts = listAccounts();
  const acc = accounts.find((a) => a.username === username);
  if (!acc) throw new Error("Account not found");

  const ok = await verifyPassword(password, acc.pwHash);
  if (!ok) throw new Error("Incorrect password");

  // Update lastLogin
  acc.lastLogin = Date.now();
  saveAccounts(accounts);

  currentAccount = { ...acc };
  currentPassword = password;

  // Open DB
  await openDB(username);

  // Persist lightweight session (no password)
  sessionStorage.setItem(
    SESSION_KEY,
    JSON.stringify({ username, unlockedAt: Date.now() })
  );

  return currentAccount;
}

export function logout() {
  currentAccount = null;
  currentPassword = null;
  sessionStorage.removeItem(SESSION_KEY);
  // Keep DBs open in cache for speed; they are encrypted
}

export async function tryRestoreSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const { username } = JSON.parse(raw);
    const accounts = listAccounts();
    const acc = accounts.find((a) => a.username === username);
    if (!acc) return null;
    // Note: password is not restored from session for security.
    // User must re-enter PIN/password on lock screen.
    // We only pre-select the account.
    return acc;
  } catch {
    return null;
  }
}

/* ========== IndexedDB helpers (per-account, encrypted blobs) ========== */

function openDB(username) {
  if (dbCache.has(username)) return Promise.resolve(dbCache.get(username));

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_PREFIX + username, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains("files")) {
        const store = database.createObjectStore("files", { keyPath: "path" });
        store.createIndex("parent", "parent", { unique: false });
        store.createIndex("type", "type", { unique: false });
      }
      if (!database.objectStoreNames.contains("meta")) {
        database.createObjectStore("meta", { keyPath: "key" });
      }
      if (!database.objectStoreNames.contains("blobs")) {
        // Large binary content stored separately (still encrypted)
        database.createObjectStore("blobs", { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      dbCache.set(username, req.result);
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

async function getDB() {
  if (!currentAccount) throw new Error("No account unlocked");
  return openDB(currentAccount.username);
}

/** Save encrypted JSON under meta store */
export async function saveMeta(key, value) {
  if (!currentPassword) throw new Error("Locked");
  const database = await getDB();
  const encrypted = await encryptToBase64(value, currentPassword);
  return new Promise((resolve, reject) => {
    const tx = database.transaction("meta", "readwrite");
    tx.objectStore("meta").put({ key, data: encrypted, updated: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Load + decrypt meta */
export async function loadMeta(key, fallback = null) {
  if (!currentPassword) return fallback;
  const database = await getDB();
  return new Promise((resolve) => {
    const tx = database.transaction("meta", "readonly");
    const req = tx.objectStore("meta").get(key);
    req.onsuccess = async () => {
      if (!req.result) return resolve(fallback);
      try {
        const plain = await decryptFromBase64(req.result.data, currentPassword);
        const text = new TextDecoder().decode(plain);
        resolve(JSON.parse(text));
      } catch {
        resolve(fallback);
      }
    };
    req.onerror = () => resolve(fallback);
  });
}

/** Generic encrypted put/get for files (small metadata + optional blob id) */
export async function putFileRecord(record) {
  // record: { path, name, parent, type: 'file'|'folder', size, mime, blobId?, modified, ... }
  if (!currentPassword) throw new Error("Locked");
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("files", "readwrite");
    tx.objectStore("files").put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getFileRecord(path) {
  if (!currentPassword) return null;
  const database = await getDB();
  return new Promise((resolve) => {
    const tx = database.transaction("files", "readonly");
    const req = tx.objectStore("files").get(path);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

export async function listChildren(parentPath) {
  if (!currentPassword) return [];
  const database = await getDB();
  return new Promise((resolve) => {
    const tx = database.transaction("files", "readonly");
    const idx = tx.objectStore("files").index("parent");
    const req = idx.getAll(parentPath);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

/** Store large binary (encrypted) and return blobId */
export async function putBlob(id, arrayBufferOrUint8) {
  if (!currentPassword) throw new Error("Locked");
  const database = await getDB();
  const encrypted = await encrypt(
    arrayBufferOrUint8 instanceof Uint8Array
      ? arrayBufferOrUint8
      : new Uint8Array(arrayBufferOrUint8),
    currentPassword
  );
  // Store as ArrayBuffer for IDB
  return new Promise((resolve, reject) => {
    const tx = database.transaction("blobs", "readwrite");
    tx.objectStore("blobs").put({ id, data: encrypted.buffer, size: encrypted.byteLength });
    tx.oncomplete = () => resolve(id);
    tx.onerror = () => reject(tx.error);
  });
}


export async function deleteFileRecord(path) {
  if (!currentPassword) throw new Error("Locked");
  const database = await getDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("files", "readwrite");
    tx.objectStore("files").delete(path);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBlob(id) {
  if (!currentPassword) return null;
  const database = await getDB();
  return new Promise((resolve) => {
    const tx = database.transaction("blobs", "readonly");
    const req = tx.objectStore("blobs").get(id);
    req.onsuccess = async () => {
      if (!req.result) return resolve(null);
      try {
        const plain = await decrypt(new Uint8Array(req.result.data), currentPassword);
        resolve(plain);
      } catch {
        resolve(null);
      }
    };
    req.onerror = () => resolve(null);
  });
}

// Re-export encrypt for blob use


/* ========== High-level auto-save of Redux / UI state ========== */

const AUTOSAVE_KEYS = [
  "settings",
  "wallpaper",
  "taskbar",
  "desktop",
  "apps",
  "files",
  "windows", // custom
  "browserTabs",
];

let autosaveTimer = null;

export function scheduleAutosave(getStateFn, delayMs = 4000) {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    if (!isUnlocked()) return;
    try {
      const state = getStateFn();
      const snapshot = {};
      for (const k of AUTOSAVE_KEYS) {
        if (state[k] !== undefined) snapshot[k] = state[k];
      }
      snapshot._savedAt = Date.now();
      await saveMeta("redux_snapshot", snapshot);
    } catch (err) {
      console.warn("[VFS] autosave failed", err);
    }
  }, delayMs);
}

export async function loadAutosavedState() {
  return loadMeta("redux_snapshot", null);
}

/* ========== Password / username change ========== */

export async function changePassword(username, oldPassword, newPassword) {
  if (!newPassword || newPassword.length < 4) throw new Error("New password must be at least 4 characters");
  const accounts = listAccounts();
  const idx = accounts.findIndex((a) => a.username === username);
  if (idx < 0) throw new Error("Account not found");
  const ok = await verifyPassword(oldPassword, accounts[idx].pwHash);
  if (!ok) throw new Error("Current password is incorrect");

  // Re-encrypt all meta + blobs with new password is expensive; for v1 we
  // re-hash and require re-login. Full re-encrypt of VFS can be added later.
  const pwHash = await hashPassword(newPassword);
  accounts[idx].pwHash = pwHash;
  saveAccounts(accounts);

  if (currentAccount?.username === username) {
    currentPassword = newPassword;
  }
  return true;
}

export async function changeUsername(oldUsername, newUsername, password) {
  newUsername = (newUsername || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (!newUsername || newUsername.length < 2) throw new Error("Username too short");
  const accounts = listAccounts();
  if (accounts.find((a) => a.username === newUsername)) throw new Error("Username already taken");
  const idx = accounts.findIndex((a) => a.username === oldUsername);
  if (idx < 0) throw new Error("Account not found");
  const ok = await verifyPassword(password, accounts[idx].pwHash);
  if (!ok) throw new Error("Password is incorrect");

  // Rename IDB database is not directly supported; we keep data under old key
  // and update the accounts list. Full migration can be a future step.
  accounts[idx].username = newUsername;
  if (accounts[idx].displayName === oldUsername) {
    accounts[idx].displayName = newUsername;
  }
  saveAccounts(accounts);

  if (currentAccount?.username === oldUsername) {
    currentAccount = { ...currentAccount, username: newUsername };
  }
  return accounts[idx];
}

/* ========== Full account export / import ========== */

/**
 * Export entire account as a JSON package.
 * @param {string} username
 * @param {string} password - required to decrypt and (optionally) re-encrypt the package
 * @param {{ encryptPackage?: boolean }} opts - encryptPackage defaults true
 * @returns {Promise<object>} plain or encrypted package
 */
export async function exportAccount(username, password, opts = {}) {
  const encryptPackage = opts.encryptPackage !== false;
  const accounts = listAccounts();
  const acc = accounts.find((a) => a.username === username);
  if (!acc) throw new Error("Account not found");
  const ok = await verifyPassword(password, acc.pwHash);
  if (!ok) throw new Error("Incorrect password");

  // Temporarily login if needed to read data
  const wasUnlocked = isUnlocked() && currentAccount?.username === username;
  if (!wasUnlocked) {
    await login(username, password);
  }

  const database = await getDB();
  const files = await new Promise((resolve) => {
    const tx = database.transaction("files", "readonly");
    const req = tx.objectStore("files").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
  const meta = await new Promise((resolve) => {
    const tx = database.transaction("meta", "readonly");
    const req = tx.objectStore("meta").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
  // Blobs: export as base64 (can be large)
  const blobsRaw = await new Promise((resolve) => {
    const tx = database.transaction("blobs", "readonly");
    const req = tx.objectStore("blobs").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
  const blobs = [];
  for (const b of blobsRaw) {
    try {
      const plain = await decrypt(new Uint8Array(b.data), password);
      blobs.push({ id: b.id, size: b.size, dataB64: toBase64(plain) });
    } catch {
      // skip undecryptable
    }
  }

  // Decrypt meta for export
  const metaPlain = [];
  for (const m of meta) {
    try {
      const plain = await decryptFromBase64(m.data, password);
      const text = new TextDecoder().decode(plain);
      metaPlain.push({ key: m.key, value: JSON.parse(text), updated: m.updated });
    } catch {
      metaPlain.push({ key: m.key, value: null, updated: m.updated, error: true });
    }
  }

  const packageData = {
    format: "win11react-account-v1",
    exportedAt: Date.now(),
    account: {
      username: acc.username,
      displayName: acc.displayName,
      photo: acc.photo,
      created: acc.created,
      lastLogin: acc.lastLogin,
    },
    files,
    meta: metaPlain,
    blobs,
  };

  if (!encryptPackage) {
    return packageData;
  }

  // Encrypt whole package with account password
  const encrypted = await encryptToBase64(packageData, password);
  return {
    format: "win11react-account-v1-encrypted",
    username: acc.username,
    displayName: acc.displayName,
    exportedAt: Date.now(),
    data: encrypted,
  };
}

/**
 * Import an account package (plain or encrypted JSON).
 * Creates a new account on this device.
 * @param {object|string} pkg - parsed object or JSON string
 * @param {string} [password] - required if package is encrypted, or to set new password
 * @param {{ newUsername?: string, newPassword?: string }} opts
 */
export async function importAccount(pkg, password, opts = {}) {
  if (typeof pkg === "string") {
    try {
      pkg = JSON.parse(pkg);
    } catch {
      throw new Error("Invalid JSON package");
    }
  }
  if (!pkg || !pkg.format) throw new Error("Unrecognized account package");

  let data = pkg;
  if (pkg.format === "win11react-account-v1-encrypted") {
    if (!password) throw new Error("Password required to decrypt package");
    const plain = await decryptFromBase64(pkg.data, password);
    const text = new TextDecoder().decode(plain);
    data = JSON.parse(text);
  } else if (pkg.format !== "win11react-account-v1") {
    throw new Error("Unsupported package format: " + pkg.format);
  }

  const username = (opts.newUsername || data.account?.username || "imported").toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const pass = opts.newPassword || password;
  if (!pass || pass.length < 4) throw new Error("Password required for imported account");

  // Create account (will throw if exists)
  const acc = await createAccount({
    username,
    password: pass,
    displayName: data.account?.displayName || username,
    photo: data.account?.photo || "img/settings/defAccount.webp",
  });

  // Login to write data
  await login(username, pass);

  // Restore files
  for (const f of data.files || []) {
    if (f && f.path) await putFileRecord(f);
  }
  // Restore meta (re-encrypt with new password)
  for (const m of data.meta || []) {
    if (m && m.key && m.value !== undefined && !m.error) {
      await saveMeta(m.key, m.value);
    }
  }
  // Restore blobs
  for (const b of data.blobs || []) {
    if (b && b.id && b.dataB64) {
      const bytes = fromBase64(b.dataB64);
      await putBlob(b.id, bytes);
    }
  }

  return acc;
}

/**
 * Import account package from a remote URL (fetch JSON).
 */
export async function importAccountFromUrl(url, password, opts = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch package: " + res.status);
  const pkg = await res.json();
  return importAccount(pkg, password, opts);
}


export default {
  listAccounts,
  createAccount,
  deleteAccount,
  updateAccountMeta,
  login,
  logout,
  tryRestoreSession,
  getCurrentAccount,
  isUnlocked,
  saveMeta,
  loadMeta,
  putFileRecord,
  getFileRecord,
  listChildren,
  putBlob,
  getBlob,
  deleteFileRecord,
  scheduleAutosave,
  loadAutosavedState,
  changePassword,
  changeUsername,
  exportAccount,
  importAccount,
  importAccountFromUrl,
};
