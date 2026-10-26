import React, { useEffect, useState, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Image, ToolBar } from "../../../utils/general";
import accounts from "../../../utils/vfs/accounts";
import "./assets/settings.scss"; // reuse settings look for consistency

/**
 * Windows-style Accounts manager
 * - List accounts on device (icons, names)
 * - Change password / username / photo
 * - Persistence manager (autosave info)
 * - Export / import encrypted or plain account packages
 * - Import from file or URL
 * - Placeholder for mail & browser extensions
 */
export const Accounts = () => {
  const wnapp = useSelector((state) => state.apps.user);
  const dispatch = useDispatch();
  const fileInputRef = useRef(null);

  const [list, setList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState("list"); // list | detail | export | import | persistence | extensions | mail
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // forms
  const [pwForm, setPwForm] = useState({ old: "", next: "", confirm: "" });
  const [nameForm, setNameForm] = useState({ displayName: "", username: "", password: "" });
  const [exportOpts, setExportOpts] = useState({ password: "", encrypt: true });
  const [importOpts, setImportOpts] = useState({ password: "", newUsername: "", url: "" });

  const current = accounts.getCurrentAccount();

  const refresh = () => {
    const a = accounts.listAccounts();
    setList(a);
    if (selected) {
      const still = a.find((x) => x.username === selected.username);
      setSelected(still || null);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  if (!wnapp) return null;

  const flash = (m, isErr = false) => {
    if (isErr) {
      setErr(m);
      setMsg("");
    } else {
      setMsg(m);
      setErr("");
    }
    setTimeout(() => {
      setMsg("");
      setErr("");
    }, 4000);
  };

  const doChangePassword = async () => {
    if (!selected) return;
    if (pwForm.next !== pwForm.confirm) {
      flash("New passwords do not match", true);
      return;
    }
    try {
      await accounts.changePassword(selected.username, pwForm.old, pwForm.next);
      flash("Password updated");
      setPwForm({ old: "", next: "", confirm: "" });
    } catch (e) {
      flash(e.message || "Failed", true);
    }
  };

  const doChangeNames = async () => {
    if (!selected) return;
    try {
      if (nameForm.displayName && nameForm.displayName !== selected.displayName) {
        await accounts.updateAccountMeta(selected.username, {
          displayName: nameForm.displayName,
        });
      }
      if (nameForm.username && nameForm.username !== selected.username) {
        await accounts.changeUsername(
          selected.username,
          nameForm.username,
          nameForm.password
        );
      }
      refresh();
      flash("Account details updated");
      // sync Redux display name if current user
      if (current?.username === selected.username || current?.username === nameForm.username) {
        dispatch({
          type: "STNGSETV",
          payload: {
            path: "person.name",
            value: nameForm.displayName || nameForm.username || selected.displayName,
          },
        });
      }
    } catch (e) {
      flash(e.message || "Failed", true);
    }
  };

  const doExport = async () => {
    if (!selected) return;
    try {
      const pkg = await accounts.exportAccount(
        selected.username,
        exportOpts.password,
        { encryptPackage: exportOpts.encrypt }
      );
      const blob = new Blob([JSON.stringify(pkg, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selected.username}-account${exportOpts.encrypt ? "-encrypted" : ""}.json`;
      a.click();
      URL.revokeObjectURL(url);
      flash("Account package downloaded");
    } catch (e) {
      flash(e.message || "Export failed", true);
    }
  };

  const doImportFile = async (file) => {
    try {
      const text = await file.text();
      const pkg = JSON.parse(text);
      const acc = await accounts.importAccount(pkg, importOpts.password, {
        newUsername: importOpts.newUsername || undefined,
        newPassword: importOpts.password,
      });
      refresh();
      flash(`Imported account: ${acc.displayName || acc.username}`);
      setPage("list");
    } catch (e) {
      flash(e.message || "Import failed", true);
    }
  };

  const doImportUrl = async () => {
    try {
      const acc = await accounts.importAccountFromUrl(
        importOpts.url,
        importOpts.password,
        { newUsername: importOpts.newUsername || undefined, newPassword: importOpts.password }
      );
      refresh();
      flash(`Imported account: ${acc.displayName || acc.username}`);
      setPage("list");
    } catch (e) {
      flash(e.message || "Import from URL failed", true);
    }
  };

  const doDelete = async () => {
    if (!selected) return;
    const pw = window.prompt("Enter password to delete this account permanently:");
    if (pw == null) return;
    try {
      await accounts.deleteAccount(selected.username, pw);
      setSelected(null);
      setPage("list");
      refresh();
      flash("Account deleted");
    } catch (e) {
      flash(e.message || "Delete failed", true);
    }
  };

  return (
    <div
      className="settingsApp floatTab dpShad"
      data-size={wnapp.size}
      data-max={wnapp.max}
      style={{
        ...(wnapp.size == "cstm" ? wnapp.dim : null),
        zIndex: wnapp.z,
      }}
      data-hide={wnapp.hide}
      id={wnapp.icon + "App"}
    >
      <ToolBar
        app={wnapp.action}
        icon={wnapp.icon}
        size={wnapp.size}
        name="Accounts"
      />
      <div className="windowScreen flex flex-col" data-dock="true">
        <div className="restWindow flex-grow flex flex-col">
          <nav>
            <div className="nav_top">
              <div className="account">
                <img
                  src={
                    current?.photo ||
                    selected?.photo ||
                    "img/settings/defAccount.webp"
                  }
                  alt=""
                  height={60}
                  width={60}
                />
                <div>
                  <p>
                    {current?.displayName ||
                      selected?.displayName ||
                      "Accounts"}
                  </p>
                  <p>Manage accounts on this device</p>
                </div>
              </div>
            </div>
            <div className="nav_bottom win11Scroll">
              {[
                ["list", "Your accounts"],
                ["persistence", "Persistence"],
                ["export", "Export"],
                ["import", "Import"],
                ["mail", "Email & accounts"],
                ["extensions", "Browser extensions"],
              ].map(([id, label]) => (
                <div
                  key={id}
                  className={`navLink ${page === id || (page === "detail" && id === "list") ? "selected" : ""}`}
                  onClick={() => {
                    setPage(id);
                    setErr("");
                    setMsg("");
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          </nav>

          <main className="flex-grow overflow-auto p-4">
            {(msg || err) && (
              <div
                className={`mb-3 text-sm px-3 py-2 rounded ${
                  err ? "bg-red-900/40 text-red-200" : "bg-green-900/40 text-green-200"
                }`}
              >
                {err || msg}
              </div>
            )}

            {/* ===== Account list (Windows-like) ===== */}
            {page === "list" && (
              <div>
                <h1 className="text-2xl font-semibold mb-4">Accounts on this device</h1>
                <p className="text-sm opacity-70 mb-4">
                  Sign-in options use AES-GCM encryption. Passwords are never stored in plain text.
                </p>
                <div className="flex flex-wrap gap-4">
                  {list.map((acc) => (
                    <div
                      key={acc.username}
                      className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer border border-white/10 min-w-[220px]"
                      onClick={() => {
                        setSelected(acc);
                        setNameForm({
                          displayName: acc.displayName || "",
                          username: acc.username,
                          password: "",
                        });
                        setPage("detail");
                      }}
                    >
                      <img
                        src={acc.photo || "img/settings/defAccount.webp"}
                        alt=""
                        className="rounded-full object-cover"
                        width={48}
                        height={48}
                      />
                      <div>
                        <div className="font-medium">
                          {acc.displayName || acc.username}
                        </div>
                        <div className="text-xs opacity-60">Local Account</div>
                        <div className="text-xs opacity-50">{acc.username}</div>
                      </div>
                    </div>
                  ))}
                  <div
                    className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer border border-dashed border-white/20 min-w-[220px]"
                    onClick={() => {
                      // Jump to lock screen create flow is complex; guide user
                      flash("Use the lock screen “Add account” to create a new local account");
                    }}
                  >
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-2xl">
                      +
                    </div>
                    <div>
                      <div className="font-medium">Add account</div>
                      <div className="text-xs opacity-60">Local account</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ===== Account detail: password + username ===== */}
            {page === "detail" && selected && (
              <div className="max-w-xl">
                <button
                  className="text-sm opacity-70 mb-3 hover:underline"
                  onClick={() => setPage("list")}
                >
                  ← Back to accounts
                </button>
                <div className="flex items-center gap-4 mb-6">
                  <img
                    src={selected.photo || "img/settings/defAccount.webp"}
                    className="rounded-full"
                    width={72}
                    height={72}
                    alt=""
                  />
                  <div>
                    <h1 className="text-xl font-semibold">
                      {selected.displayName || selected.username}
                    </h1>
                    <p className="text-sm opacity-60">Local Account · {selected.username}</p>
                  </div>
                </div>

                <section className="mb-6">
                  <h2 className="font-medium mb-2">Account name</h2>
                  <input
                    className="w-full mb-2 px-3 py-2 rounded bg-black/30 border border-white/10"
                    placeholder="Display name"
                    value={nameForm.displayName}
                    onChange={(e) =>
                      setNameForm({ ...nameForm, displayName: e.target.value })
                    }
                  />
                  <input
                    className="w-full mb-2 px-3 py-2 rounded bg-black/30 border border-white/10"
                    placeholder="Username"
                    value={nameForm.username}
                    onChange={(e) =>
                      setNameForm({ ...nameForm, username: e.target.value })
                    }
                  />
                  <input
                    type="password"
                    className="w-full mb-2 px-3 py-2 rounded bg-black/30 border border-white/10"
                    placeholder="Current password (required to change username)"
                    value={nameForm.password}
                    onChange={(e) =>
                      setNameForm({ ...nameForm, password: e.target.value })
                    }
                  />
                  <button
                    className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm"
                    onClick={doChangeNames}
                  >
                    Save name changes
                  </button>
                </section>

                <section className="mb-6">
                  <h2 className="font-medium mb-2">Change password</h2>
                  <p className="text-xs opacity-60 mb-2">
                    Passwords are protected with AES-GCM (PBKDF2-SHA256, 310 000 iterations).
                  </p>
                  <input
                    type="password"
                    className="w-full mb-2 px-3 py-2 rounded bg-black/30 border border-white/10"
                    placeholder="Current password"
                    value={pwForm.old}
                    onChange={(e) => setPwForm({ ...pwForm, old: e.target.value })}
                  />
                  <input
                    type="password"
                    className="w-full mb-2 px-3 py-2 rounded bg-black/30 border border-white/10"
                    placeholder="New password"
                    value={pwForm.next}
                    onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
                  />
                  <input
                    type="password"
                    className="w-full mb-2 px-3 py-2 rounded bg-black/30 border border-white/10"
                    placeholder="Confirm new password"
                    value={pwForm.confirm}
                    onChange={(e) =>
                      setPwForm({ ...pwForm, confirm: e.target.value })
                    }
                  />
                  <button
                    className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm"
                    onClick={doChangePassword}
                  >
                    Change password
                  </button>
                </section>

                <section>
                  <button
                    className="px-4 py-2 rounded bg-red-800/80 hover:bg-red-700 text-white text-sm"
                    onClick={doDelete}
                  >
                    Delete account
                  </button>
                </section>
              </div>
            )}

            {/* ===== Persistence manager ===== */}
            {page === "persistence" && (
              <div className="max-w-xl">
                <h1 className="text-2xl font-semibold mb-3">Persistence manager</h1>
                <p className="text-sm opacity-70 mb-4">
                  All account data, files, window layouts, settings, and browser-related
                  state are stored in IndexedDB and encrypted with AES-GCM using your
                  account password.
                </p>
                <ul className="text-sm space-y-2 mb-4 list-disc pl-5">
                  <li>Auto-save runs every few seconds while signed in</li>
                  <li>File system (VFS) is per-account and encrypted at rest</li>
                  <li>Redux snapshot (settings, wallpaper, apps) is encrypted</li>
                  <li>Large files stored as encrypted blobs</li>
                </ul>
                <p className="text-sm">
                  Signed in as:{" "}
                  <strong>
                    {current
                      ? current.displayName || current.username
                      : "Nobody (locked)"}
                  </strong>
                </p>
                <p className="text-xs opacity-60 mt-2">
                  Accounts on device: {list.length}
                </p>
              </div>
            )}

            {/* ===== Export ===== */}
            {page === "export" && (
              <div className="max-w-xl">
                <h1 className="text-2xl font-semibold mb-3">Export account</h1>
                <p className="text-sm opacity-70 mb-4">
                  Download a full JSON package of an account (files, settings metadata,
                  blobs). By default the package itself is encrypted with the account
                  password.
                </p>
                <label className="block text-sm mb-1">Account</label>
                <select
                  className="w-full mb-3 px-3 py-2 rounded bg-black/30 border border-white/10"
                  value={selected?.username || ""}
                  onChange={(e) => {
                    const a = list.find((x) => x.username === e.target.value);
                    setSelected(a || null);
                  }}
                >
                  <option value="">Select account…</option>
                  {list.map((a) => (
                    <option key={a.username} value={a.username}>
                      {a.displayName || a.username}
                    </option>
                  ))}
                </select>
                <input
                  type="password"
                  className="w-full mb-2 px-3 py-2 rounded bg-black/30 border border-white/10"
                  placeholder="Account password"
                  value={exportOpts.password}
                  onChange={(e) =>
                    setExportOpts({ ...exportOpts, password: e.target.value })
                  }
                />
                <label className="flex items-center gap-2 text-sm mb-4">
                  <input
                    type="checkbox"
                    checked={exportOpts.encrypt}
                    onChange={(e) =>
                      setExportOpts({ ...exportOpts, encrypt: e.target.checked })
                    }
                  />
                  Encrypt package with account password (recommended)
                </label>
                <button
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm"
                  onClick={doExport}
                  disabled={!selected}
                >
                  Export JSON
                </button>
              </div>
            )}

            {/* ===== Import ===== */}
            {page === "import" && (
              <div className="max-w-xl">
                <h1 className="text-2xl font-semibold mb-3">Import account</h1>
                <p className="text-sm opacity-70 mb-4">
                  Import a full account package from a local JSON file or a web URL.
                  Creates a new account on this device.
                </p>
                <input
                  type="password"
                  className="w-full mb-2 px-3 py-2 rounded bg-black/30 border border-white/10"
                  placeholder="Password (to decrypt package / set for new account)"
                  value={importOpts.password}
                  onChange={(e) =>
                    setImportOpts({ ...importOpts, password: e.target.value })
                  }
                />
                <input
                  className="w-full mb-3 px-3 py-2 rounded bg-black/30 border border-white/10"
                  placeholder="Optional new username"
                  value={importOpts.newUsername}
                  onChange={(e) =>
                    setImportOpts({ ...importOpts, newUsername: e.target.value })
                  }
                />

                <div className="mb-4">
                  <button
                    className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm mr-2"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload JSON file
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) doImportFile(f);
                    }}
                  />
                </div>

                <div className="text-sm opacity-60 mb-2">— or from URL —</div>
                <input
                  className="w-full mb-2 px-3 py-2 rounded bg-black/30 border border-white/10"
                  placeholder="https://example.com/account.json"
                  value={importOpts.url}
                  onChange={(e) =>
                    setImportOpts({ ...importOpts, url: e.target.value })
                  }
                />
                <button
                  className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-sm"
                  onClick={doImportUrl}
                >
                  Import from URL
                </button>
              </div>
            )}

            {/* ===== Email & accounts (placeholder matching Windows) ===== */}
            {page === "mail" && (
              <div className="max-w-xl">
                <h1 className="text-2xl font-semibold mb-3">Email & accounts</h1>
                <p className="text-sm opacity-70 mb-4">
                  Accounts used by email, calendar, and contacts. Additional account
                  types can be linked here in a future update.
                </p>
                <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <div className="font-medium">Local accounts on this device</div>
                  <div className="text-sm opacity-60 mt-1">
                    {list.length} account{list.length !== 1 ? "s" : ""} · managed above
                  </div>
                </div>
                <p className="text-xs opacity-50 mt-4">
                  Microsoft / Google / other cloud account linking will appear here
                  when online identity providers are enabled.
                </p>
              </div>
            )}

            {/* ===== Browser extensions ===== */}
            {page === "extensions" && (
              <div className="max-w-xl">
                <h1 className="text-2xl font-semibold mb-3">Browser extensions</h1>
                <p className="text-sm opacity-70 mb-4">
                  Manage extensions for the built-in Browser. Extension data is stored
                  per account in the encrypted VFS when available.
                </p>
                <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-sm opacity-70">
                  No extensions installed yet. When the Browser multi-tab system is
                  fully wired, installed extensions will appear here with enable /
                  disable and remove controls.
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

export default Accounts;
