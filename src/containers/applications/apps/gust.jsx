import React, { useState } from "react";
import { useSelector } from "react-redux";
import { ToolBar } from "../../../utils/general";

/**
 * GUST Official Unblocker — static single-file app from /gust/official.html
 */
export const Gust = () => {
  const wnapp = useSelector((state) => state.apps.gust);
  const [status, setStatus] = useState("Loading GUST…");
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
        name="GUST"
        invert
      />
      <div className="windowScreen flex flex-col" data-dock="true">
        <div
          className="restWindow flex-grow"
          style={{ position: "relative", minHeight: 0, overflow: "hidden" }}
        >
          {status && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9de5ff",
                fontSize: 13,
                pointerEvents: "none",
                zIndex: 1,
              }}
            >
              {status}
            </div>
          )}
          <iframe
            title="GUST Official Unblocker"
            src="/gust/official.html"
            onLoad={() => setStatus("")}
            onError={() => setStatus("Failed to load GUST (check /gust/official.html)")}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
              background: "#0b1220",
            }}
            allow="clipboard-read; clipboard-write; fullscreen; storage-access; autoplay"
          />
        </div>
      </div>
    </div>
  );
};

export default Gust;
