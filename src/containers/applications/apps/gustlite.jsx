import React from "react";
import { useSelector } from "react-redux";
import { ToolBar } from "../../../utils/general";

/**
 * GUST Lite Unblocker — loads vendored single-file app from /gust/lite.html
 */
export const GustLite = () => {
  const wnapp = useSelector((state) => state.apps.gustlite);
  if (!wnapp) return null;

  return (
    <div
      className="floatTab dpShad"
      data-size={wnapp.size}
      data-max={wnapp.max}
      style={{
        ...(wnapp.size == "cstm" ? wnapp.dim : null),
        zIndex: wnapp.z,
        background: "#0b1220",
      }}
      data-hide={wnapp.hide}
      id={wnapp.icon + "App"}
    >
      <ToolBar
        app={wnapp.action}
        icon={wnapp.icon}
        size={wnapp.size}
        name="GUST Lite"
        invert
      />
      <div className="windowScreen flex flex-col" data-dock="true">
        <iframe
          title="GUST Lite Unblocker"
          src="./gust/lite.html"
          style={{
            flex: 1,
            width: "100%",
            height: "100%",
            border: "none",
            background: "#0b1220",
          }}
          allow="clipboard-read; clipboard-write; fullscreen; storage-access"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-modals allow-downloads allow-pointer-lock"
        />
      </div>
    </div>
  );
};

export default GustLite;
