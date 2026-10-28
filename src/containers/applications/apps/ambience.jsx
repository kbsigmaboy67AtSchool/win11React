import React, { useState } from "react";
import { useSelector } from "react-redux";
import { ToolBar } from "../../../utils/general";

/** GitHub Pages deploy of ambience-studio/v1 (inlined; Blocksi cannot overlay) */
const AMBIENCE_URL =
  "https://kbsigmaboy67atschool.github.io/utils/ambience-studio/v1/";

/**
 * Ambience Studio — ambient sound / visual studio loaded from GitHub Pages.
 */
export const Ambience = () => {
  const wnapp = useSelector((state) => state.apps.ambience);
  const [status, setStatus] = useState("Loading Ambience Studio…");
  if (!wnapp) return null;

  return (
    <div
      className="floatTab dpShad"
      data-size={wnapp.size}
      data-max={wnapp.max}
      style={{
        ...(wnapp.size == "cstm" ? wnapp.dim : null),
        zIndex: wnapp.z,
        background: "#02040a",
      }}
      data-hide={wnapp.hide}
      id={wnapp.icon + "App"}
    >
      <ToolBar
        app={wnapp.action}
        icon={wnapp.icon}
        size={wnapp.size}
        name="Ambience Studio"
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
                color: "#7ef0ff",
                fontSize: 13,
                pointerEvents: "none",
                zIndex: 1,
                background: "#02040a",
              }}
            >
              {status}
            </div>
          )}
          <iframe
            title="Ambience Studio"
            src={AMBIENCE_URL}
            onLoad={() => setStatus("")}
            onError={() => setStatus("Failed to load Ambience Studio")}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
              background: "#02040a",
            }}
            allow="autoplay; clipboard-read; clipboard-write; fullscreen; microphone"
          />
        </div>
      </div>
    </div>
  );
};

export default Ambience;
