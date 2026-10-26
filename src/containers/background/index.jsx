import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import Battery from "../../components/shared/Battery";
import { Icon, Image } from "../../utils/general";
import accounts from "../../utils/vfs/accounts";
import fs from "../../utils/vfs/fs";
import "./back.scss";

export const Background = () => {
  const wall = useSelector((state) => state.wallpaper);
  const dispatch = useDispatch();

  return (
    <div
      className="background"
      style={{
        backgroundImage: `url(img/wallpaper/${wall.src})`,
      }}
    ></div>
  );
};

export const BootScreen = (props) => {
  const dispatch = useDispatch();
  const wall = useSelector((state) => state.wallpaper);
  const [blackout, setBlackOut] = useState(false);

  useEffect(() => {
    if (props.dir < 0) {
      setTimeout(() => {
        setBlackOut(true);
      }, 4000);
    }
  }, [props.dir]);

  useEffect(() => {
    if (props.dir < 0) {
      if (blackout) {
        if (wall.act == "restart") {
          setTimeout(() => {
            setBlackOut(false);
            setTimeout(() => {
              dispatch({ type: "WALLBOOTED" });
            }, 4000);
          }, 2000);
        }
      }
    }
  }, [blackout]);

  return (
    <div className="bootscreen">
      <div className={blackout ? "hidden" : ""}>
        <Image src="asset/bootlogo" w={180} />
        <div className="mt-48" id="loader">
          <svg
            className="progressRing"
            height={48}
            width={48}
            viewBox="0 0 16 16"
          >
            <circle cx="8px" cy="8px" r="7px"></circle>
          </svg>
        </div>
      </div>
    </div>
  );
};

export const LockScreen = (props) => {
  const wall = useSelector((state) => state.wallpaper);
  const [lock, setLock] = useState(true); // show account picker immediately
  const [unlocked, setUnLock] = useState(false);
  const [password, setPass] = useState("");
  const [error, setError] = useState("");
  const [accountsList, setAccountsList] = useState([]);
  const [selected, setSelected] = useState(null); // account object
  const [mode, setMode] = useState("picker"); // picker | password | create
  const [newUser, setNewUser] = useState({ username: "", displayName: "", password: "" });
  const dispatch = useDispatch();

  // Fallback name from Redux for first-run visual
  const fallbackName = useSelector((state) => state.setting.person.name);

  useEffect(() => {
    const list = accounts.listAccounts();
    setAccountsList(list);
    if (list.length === 1) {
      setSelected(list[0]);
    }
    // Pre-select last session account if any
    accounts.tryRestoreSession().then((acc) => {
      if (acc) setSelected(acc);
    });
  }, []);

  const action = (e) => {
    const act = e.target.dataset.action;
    if (act === "splash") setLock(true);
  };

  const selectAccount = (acc) => {
    setSelected(acc);
    setPass("");
    setError("");
    setMode("password");
  };

  const proceedLogin = async () => {
    if (!selected) return;
    setError("");
    try {
      await accounts.login(selected.username, password || "0000");
      // Ensure Windows-like folders exist
      await fs.ensureDefaultTree();
      // Restore autosaved state if present
      const snap = await accounts.loadAutosavedState();
      if (snap) {
        if (snap.settings) dispatch({ type: "SETTLOAD", payload: snap.settings });
        if (snap.wallpaper) dispatch({ type: "WALLSET", payload: snap.wallpaper.src || snap.wallpaper });
        // other slices can be restored later
      }
      // Update display name in settings
      dispatch({
        type: "STNGSETV",
        payload: { path: "person.name", value: selected.displayName || selected.username },
      });
      setUnLock(true);
      setTimeout(() => {
        dispatch({ type: "WALLUNLOCK" });
      }, 800);
    } catch (err) {
      setError(err.message || "Incorrect password");
    }
  };

  const createAndLogin = async () => {
    setError("");
    try {
      const acc = await accounts.createAccount({
        username: newUser.username || newUser.displayName,
        password: newUser.password || "0000",
        displayName: newUser.displayName || newUser.username || "User",
        photo: "img/settings/defAccount.webp",
      });
      setAccountsList(accounts.listAccounts());
      setSelected(acc);
      setPass(newUser.password || "0000");
      // auto login
      await accounts.login(acc.username, newUser.password || "0000");
      await fs.ensureDefaultTree();
      dispatch({
        type: "STNGSETV",
        payload: { path: "person.name", value: acc.displayName },
      });
      setUnLock(true);
      setTimeout(() => dispatch({ type: "WALLUNLOCK" }), 800);
    } catch (err) {
      setError(err.message || "Could not create account");
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter") {
      if (mode === "password") proceedLogin();
      else if (mode === "create") createAndLogin();
    }
  };

  const displayName =
    selected?.displayName || selected?.username || fallbackName || "User";
  const photo = selected?.photo || "img/asset/prof.jpg";

  return (
    <div
      className={"lockscreen " + (props.dir == -1 ? "slowfadein" : "")}
      data-unlock={unlocked}
      style={{
        backgroundImage: `url(${`img/wallpaper/lock.jpg`})`,
      }}
      onClick={action}
      data-action="splash"
      data-blur={lock}
    >
      <div className="splashScreen mt-40" data-faded={lock}>
        <div className="text-6xl font-semibold text-gray-100">
          {new Date().toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "numeric",
            hour12: true,
          })}
        </div>
        <div className="text-lg font-medium text-gray-200">
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </div>
      </div>

      <div className="fadeinScreen" data-faded={!lock} data-unlock={unlocked}>
        {/* Multi-account picker */}
        {mode === "picker" && (
          <>
            <div className="text-xl font-medium text-gray-200 mb-4">
              Who's signing in?
            </div>
            <div className="flex flex-wrap justify-center gap-6 max-w-xl">
              {accountsList.map((acc) => (
                <div
                  key={acc.username}
                  className="flex flex-col items-center cursor-pointer hover:scale-105 transition"
                  onClick={() => selectAccount(acc)}
                >
                  <img
                    src={acc.photo || "img/settings/defAccount.webp"}
                    alt=""
                    className="rounded-full object-cover"
                    width={96}
                    height={96}
                    style={{ width: 96, height: 96 }}
                  />
                  <div className="mt-2 text-gray-100 text-sm font-medium">
                    {acc.displayName || acc.username}
                  </div>
                  <div className="text-xs text-gray-400">Local Account</div>
                </div>
              ))}
              <div
                className="flex flex-col items-center cursor-pointer hover:scale-105 transition"
                onClick={() => {
                  setMode("create");
                  setError("");
                }}
              >
                <div
                  className="rounded-full bg-white/20 flex items-center justify-center text-3xl text-white"
                  style={{ width: 96, height: 96 }}
                >
                  +
                </div>
                <div className="mt-2 text-gray-100 text-sm font-medium">
                  Add account
                </div>
              </div>
            </div>
            {accountsList.length === 0 && (
              <div className="text-gray-300 text-sm mt-4">
                No accounts yet — create one to get started.
              </div>
            )}
          </>
        )}

        {/* Password / PIN entry */}
        {mode === "password" && selected && (
          <>
            <img
              className="rounded-full overflow-hidden object-cover"
              src={photo}
              width={200}
              height={200}
              style={{ width: 200, height: 200 }}
              alt=""
            />
            <div className="mt-2 text-2xl font-medium text-gray-200">
              {displayName}
            </div>
            <div className="text-xs text-gray-400 mb-2">Local Account</div>
            <div className="flex items-center mt-4">
              <input
                type="password"
                value={password}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={onKey}
                placeholder="Password"
                className="bg-black/40 text-white px-4 py-2 rounded-md outline-none border border-white/20 w-56"
                autoFocus
              />
              <button
                className="ml-2 px-3 py-2 rounded-md bg-white/20 text-white hover:bg-white/30"
                onClick={proceedLogin}
              >
                →
              </button>
            </div>
            {error && (
              <div className="text-red-300 text-xs mt-2">{error}</div>
            )}
            <div
              className="text-xs text-gray-400 mt-4 cursor-pointer hover:underline"
              onClick={() => {
                setMode("picker");
                setPass("");
                setError("");
              }}
            >
              Other users
            </div>
            <div
              className="text-xs text-gray-500 mt-2 cursor-pointer"
              onClick={() => proceedLogin()}
            >
              Sign in (or press Enter)
            </div>
          </>
        )}

        {/* Create account */}
        {mode === "create" && (
          <>
            <div className="text-xl font-medium text-gray-200 mb-3">
              Create a local account
            </div>
            <input
              className="bg-black/40 text-white px-4 py-2 rounded-md outline-none border border-white/20 w-64 mb-2"
              placeholder="Display name"
              value={newUser.displayName}
              onChange={(e) =>
                setNewUser({ ...newUser, displayName: e.target.value })
              }
            />
            <input
              className="bg-black/40 text-white px-4 py-2 rounded-md outline-none border border-white/20 w-64 mb-2"
              placeholder="Username"
              value={newUser.username}
              onChange={(e) =>
                setNewUser({ ...newUser, username: e.target.value })
              }
            />
            <input
              type="password"
              className="bg-black/40 text-white px-4 py-2 rounded-md outline-none border border-white/20 w-64 mb-2"
              placeholder="Password (min 4 chars)"
              value={newUser.password}
              onChange={(e) =>
                setNewUser({ ...newUser, password: e.target.value })
              }
              onKeyDown={onKey}
            />
            {error && (
              <div className="text-red-300 text-xs mb-2">{error}</div>
            )}
            <div className="flex gap-3 mt-2">
              <button
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-500"
                onClick={createAndLogin}
              >
                Create & sign in
              </button>
              <button
                className="px-4 py-2 rounded-md bg-white/20 text-white"
                onClick={() => {
                  setMode("picker");
                  setError("");
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>

      <div className="bottomInfo flex">
        <Icon className="mx-2" src="wifi" ui width={16} invert />
        <Battery invert />
      </div>
    </div>
  );
};
