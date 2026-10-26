import { Bin } from "../utils/bin";
import fdata from "./dir.json";

const defState = {
  cdir: "%user%",
  hist: [],
  hid: 0,
  view: 1,
};

defState.hist.push(defState.cdir);
defState.data = new Bin();
defState.data.parse(fdata);

// Map special tokens used by VFS
const VFS_SPECIAL = {
  "%vfs%": "/",
};

const fileReducer = (state = defState, action) => {
  var tmp = { ...state };
  var navHist = false;

  if (action.type === "FILEDIR") {
    tmp.cdir = action.payload;
  } else if (action.type === "FILEPATH") {
    // Allow absolute VFS paths directly
    if (typeof action.payload === "string" && action.payload.startsWith("/")) {
      tmp.cdir = action.payload;
    } else {
      var pathid = tmp.data.parsePath(action.payload);
      if (pathid) tmp.cdir = pathid;
    }
  } else if (action.type === "FILEBACK") {
    // VFS parent navigation
    if (typeof tmp.cdir === "string" && tmp.cdir.startsWith("/")) {
      if (tmp.cdir === "/") {
        // stay
      } else {
        const parts = tmp.cdir.split("/").filter(Boolean);
        parts.pop();
        tmp.cdir = parts.length ? "/" + parts.join("/") : "/";
      }
    } else {
      var item = tmp.data.getId(tmp.cdir);
      if (item && item.host) {
        tmp.cdir = item.host.id;
      }
    }
  } else if (action.type === "FILEVIEW") {
    tmp.view = action.payload;
  } else if (action.type === "FILEPREV") {
    tmp.hid--;
    if (tmp.hid < 0) tmp.hid = 0;
    navHist = true;
  } else if (action.type === "FILENEXT") {
    tmp.hid++;
    if (tmp.hid > tmp.hist.length - 1) tmp.hid = tmp.hist.length - 1;
    navHist = true;
  }

  if (!navHist && tmp.cdir != tmp.hist[tmp.hid]) {
    tmp.hist.splice(tmp.hid + 1);
    tmp.hist.push(tmp.cdir);
    tmp.hid = tmp.hist.length - 1;
  }

  tmp.cdir = tmp.hist[tmp.hid];

  // Resolve special tokens
  if (typeof tmp.cdir === "string" && tmp.cdir.includes("%")) {
    if (VFS_SPECIAL[tmp.cdir] != null) {
      tmp.cdir = VFS_SPECIAL[tmp.cdir];
      tmp.hist[tmp.hid] = tmp.cdir;
    } else if (tmp.data.special[tmp.cdir] != null) {
      tmp.cdir = tmp.data.special[tmp.cdir];
      tmp.hist[tmp.hid] = tmp.cdir;
    }
  }

  // Path display
  if (typeof tmp.cdir === "string" && tmp.cdir.startsWith("/")) {
    tmp.cpath = tmp.cdir === "/" ? "This PC\\Local Disk (VFS)" : "This PC\\Local Disk (VFS)" + tmp.cdir.replace(/\//g, "\\");
  } else {
    tmp.cpath = tmp.data.getPath(tmp.cdir);
  }
  return tmp;
};

export default fileReducer;
