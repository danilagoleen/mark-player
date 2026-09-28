import { useEffect, useMemo, useRef, useState } from "react";

type MycoProbeSurface = "top_avatar" | "mini_chat_compact";
type MycoProbeState = "idle" | "ready" | "speaking";

interface MycoProbeSnapshot {
  ok: boolean;
  surface: MycoProbeSurface;
  state: MycoProbeState;
  assetName: string;
  windowInnerWidth: number;
  windowInnerHeight: number;
  surfaceWidth: number;
  surfaceHeight: number;
  slotWidth: number;
  slotHeight: number;
  assetWidth: number;
  assetHeight: number;
  clipRatio: number;
  textOverlapRatio: number;
  motionDominanceScore: number;
  layoutDelta: number;
  readabilityPass: boolean;
}

declare global {
  interface Window {
    vetkaMycoProbe?: {
      snapshot: () => MycoProbeSnapshot;
      setSurface: (surface: MycoProbeSurface) => void;
      setState: (state: MycoProbeState) => void;
    };
  }
}

function readProbeQuery() {
  const params = new URLSearchParams(window.location.search);
  const rawSurface = String(params.get("surface") || "top_avatar");
  const rawState = String(params.get("state") || "idle");
  const surface: MycoProbeSurface = rawSurface === "mini_chat_compact" ? "mini_chat_compact" : "top_avatar";
  const state: MycoProbeState = rawState === "ready" || rawState === "speaking" ? rawState : "idle";
  return { surface, state };
}

const PANEL = {
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(7,7,9,0.96)",
  color: "#f3f5f7",
  borderRadius: 18,
  boxShadow: "0 0 0 1px rgba(255,255,255,0.03) inset",
};

const LABEL = {
  color: "#8d96a2",
  fontSize: 11,
  letterSpacing: "0.08em" as const,
  textTransform: "uppercase" as const,
};

export default function MycoProbeApp() {
  const initial = useMemo(readProbeQuery, []);
  const [surface, setSurface] = useState<MycoProbeSurface>(initial.surface);
  const [state, setState] = useState<MycoProbeState>(initial.state);
  const [assetName, setAssetName] = useState("none");
  const [assetUrl, setAssetUrl] = useState("");
  const shellRef = useRef<HTMLDivElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const assetRef = useRef<HTMLImageElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (assetUrl.startsWith("blob:")) URL.revokeObjectURL(assetUrl);
    };
  }, [assetUrl]);

  const snapshot = (): MycoProbeSnapshot => {
    const shellRect = shellRef.current?.getBoundingClientRect();
    const slotRect = slotRef.current?.getBoundingClientRect();
    const assetRect = assetRef.current?.getBoundingClientRect();
    const textRect = textRef.current?.getBoundingClientRect();
    const slotWidth = Number(slotRect?.width || 0);
    const slotHeight = Number(slotRect?.height || 0);
    const assetWidth = Number(assetRect?.width || 0);
    const assetHeight = Number(assetRect?.height || 0);
    const textWidth = Number(textRect?.width || 0);
    const textHeight = Number(textRect?.height || 0);

    const clipX = Math.max(0, assetWidth - slotWidth);
    const clipY = Math.max(0, assetHeight - slotHeight);
    const slotArea = Math.max(1, slotWidth * slotHeight);
    const assetArea = Math.max(1, assetWidth * assetHeight);
    const clipRatio = Math.min(1, (clipX * slotHeight + clipY * slotWidth) / slotArea);
    const textOverlapRatio = surface === "mini_chat_compact" ? Math.min(1, assetArea / Math.max(1, textWidth * textHeight * 2.2)) : 0;
    const motionDominanceScore = Math.min(1, assetArea / Math.max(1, slotArea));
    const readabilityPass = clipRatio < 0.03 && textOverlapRatio < 0.45 && motionDominanceScore < 0.92;

    return {
      ok: Boolean(shellRect && slotRect && assetRect && assetName !== "none"),
      surface,
      state,
      assetName,
      windowInnerWidth: window.innerWidth,
      windowInnerHeight: window.innerHeight,
      surfaceWidth: Number(shellRect?.width || 0),
      surfaceHeight: Number(shellRect?.height || 0),
      slotWidth,
      slotHeight,
      assetWidth,
      assetHeight,
      clipRatio: Number(clipRatio.toFixed(4)),
      textOverlapRatio: Number(textOverlapRatio.toFixed(4)),
      motionDominanceScore: Number(motionDominanceScore.toFixed(4)),
      layoutDelta: 0,
      readabilityPass,
    };
  };

  useEffect(() => {
    window.vetkaMycoProbe = {
      snapshot,
      setSurface,
      setState,
    };
    return () => {
      delete window.vetkaMycoProbe;
    };
  });

  const stateTone = state === "speaking" ? "#ffffff" : state === "ready" ? "#d5dde7" : "#9ba3af";
  const borderTone = state === "speaking" ? "rgba(255,255,255,0.45)" : state === "ready" ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.16)";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#050608",
        color: "#f3f5f7",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        boxSizing: "border-box",
      }}
    >
      <input
        type="file"
        accept=".apng,.png,.gif,image/apng,image/png,image/gif"
        data-testid="myco-probe-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (assetUrl.startsWith("blob:")) URL.revokeObjectURL(assetUrl);
          setAssetName(file.name);
          setAssetUrl(URL.createObjectURL(file));
        }}
        style={{ position: "absolute", top: 12, left: 12, opacity: 0.001, width: 220, zIndex: 5 }}
      />
      <div style={{ position: "absolute", top: 18, right: 22, display: "flex", gap: 12, color: "#7f8892", fontSize: 12 }}>
        <span>surface:{surface}</span>
        <span>state:{state}</span>
        <span>asset:{assetName}</span>
      </div>
      {surface === "top_avatar" ? (
        <div
          ref={shellRef}
          data-testid="myco-probe-surface"
          style={{
            width: 760,
            height: 120,
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 28px",
            boxSizing: "border-box",
          }}
        >
          <div
            ref={slotRef}
            data-testid="myco-probe-slot"
            style={{
              width: 92,
              height: 72,
              border: `1px solid ${borderTone}`,
              borderRadius: 14,
              background: "#0a0b0e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {assetUrl ? (
              <img
                ref={assetRef}
                src={assetUrl}
                alt="MYCO"
                style={{ maxWidth: "82%", maxHeight: "82%", objectFit: "contain", filter: "drop-shadow(0 0 12px rgba(255,255,255,0.04))" }}
              />
            ) : null}
          </div>
          <div
            ref={textRef}
            style={{
              ...PANEL,
              width: 540,
              height: 42,
              borderColor: borderTone,
              display: "flex",
              alignItems: "center",
              padding: "0 18px",
              color: stateTone,
              fontSize: 14,
              overflow: "hidden",
            }}
          >
            Context focused: inspect node/task details • model • workflow
          </div>
        </div>
      ) : (
        <div
          ref={shellRef}
          data-testid="myco-probe-surface"
          style={{
            ...PANEL,
            width: 360,
            height: 330,
            padding: 16,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div ref={textRef} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                ref={slotRef}
                data-testid="myco-probe-slot"
                style={{
                  width: 58,
                  height: 58,
                  border: `1px solid ${borderTone}`,
                  borderRadius: 14,
                  background: "#090a0d",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {assetUrl ? (
                  <img
                    ref={assetRef}
                    src={assetUrl}
                    alt="MYCO"
                    style={{ maxWidth: "82%", maxHeight: "82%", objectFit: "contain" }}
                  />
                ) : null}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#f4f6f8" }}>task tb_1770809279_6 linked</div>
                <div style={{ color: stateTone, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>
                  MYCO: choose workflow, then review Context → Tasks → Stats
                </div>
              </div>
            </div>
            <div style={{ color: "#9aa2ad", fontSize: 18 }}>↗</div>
          </div>
          <div style={{ ...LABEL }}>Compact chat surface</div>
          <div style={{ color: "#bfc6cf", fontSize: 14, lineHeight: 1.5 }}>
            MYCO should stay readable next to text and should not dominate this compact panel.
          </div>
          <div
            style={{
              marginTop: "auto",
              border: "1px solid rgba(255,255,255,0.13)",
              borderRadius: 12,
              height: 44,
              display: "flex",
              alignItems: "center",
              padding: "0 14px",
              color: "#7f8892",
            }}
          >
            Ask MYCO...
          </div>
        </div>
      )}
    </div>
  );
}
