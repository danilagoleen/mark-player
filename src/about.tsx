import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ABOUT_LEGEND,
  ABOUT_ROADMAP,
  DONATE_USDT_TRC20,
  FEEDBACK_EMAIL,
  FEEDBACK_MAILTO,
  GITHUB_RELEASES_URL,
  GITHUB_REPO_URL,
  SUPPORT_TEXT,
} from "./lib/aboutLinks";
import logoUrl from "../src-tauri/icons/128x128.png";
import "./index.css";

async function openExternal(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

// Чистая копия текста: writer инжектится — unit-тест без моков
// navigator.clipboard (мутация jsdom-глобалов роняла сьют на мёрж-станции).
export async function copyText(
  text: string,
  write: (t: string) => Promise<void>,
  onDone: () => void,
): Promise<void> {
  try {
    await write(text);
    onDone();
  } catch {
    // clipboard unavailable — value stays visible for manual copy
  }
}

const S = {
  page: {
    display: "flex", flexDirection: "column" as const, gap: 12, height: "100vh",
    boxSizing: "border-box" as const, padding: 20, background: "#1a1a1a", color: "#e4e6eb",
    fontSize: 13, lineHeight: 1.5, overflowY: "auto" as const,
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif",
  },
  title: { margin: 0, fontSize: 17, fontWeight: 700 },
  beta: { fontSize: 12, fontWeight: 400, color: "#9ca3af" },
  header: { display: "flex" as const, alignItems: "center" as const, gap: 14 },
  logo: {
    // Логотип как есть: острые углы, крупно (вердикт оператора).
    width: 96, height: 96, borderRadius: 0, flexShrink: 0,
  },
  legend: { margin: 0, color: "#7d8590", fontSize: 12, fontStyle: "italic" as const },
  text: { margin: 0, color: "#b6bdc7" },
  roadmapTitle: { margin: 0, fontSize: 12, fontWeight: 700, color: "#9ca3af" },
  roadmapList: { margin: 0, paddingLeft: 16, color: "#9ca3af", fontSize: 12 },
  rows: { display: "flex" as const, flexDirection: "column" as const, gap: 8 },
  row: {
    display: "flex" as const, gap: 8, alignItems: "stretch" as const,
  },
  rowValue: {
    flex: 1, padding: "8px 10px", borderRadius: 8, fontSize: 11, color: "#9ca3af",
    background: "rgba(0,0,0,0.4)", border: "1px solid #333", wordBreak: "break-all" as const,
    cursor: "pointer", fontFamily: "inherit" as const, textAlign: "left" as const,
  },
  copyBtn: {
    padding: "8px 12px", borderRadius: 8, fontSize: 12, cursor: "pointer",
    border: "none", background: "rgba(255,255,255,0.12)", color: "#ccc", whiteSpace: "nowrap" as const,
  },
};

interface CopyRowDef {
  key: string;
  label: string;
  value: string;
  openUrl?: string;
}

const ROWS: CopyRowDef[] = [
  { key: "feedback", label: "Feedback", value: FEEDBACK_EMAIL, openUrl: FEEDBACK_MAILTO },
  { key: "github", label: "GitHub", value: GITHUB_REPO_URL, openUrl: GITHUB_REPO_URL },
  { key: "updates", label: "Updates", value: GITHUB_RELEASES_URL, openUrl: GITHUB_RELEASES_URL },
  { key: "donate", label: "Donate USDT (TRC20)", value: DONATE_USDT_TRC20 },
];

export function AboutPanel({ version }: { version: string }) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyRow = (row: CopyRowDef) =>
    void copyText(
      row.value,
      (t) => navigator.clipboard.writeText(t),
      () => {
        setCopiedKey(row.key);
        window.setTimeout(() => setCopiedKey((k) => (k === row.key ? null : k)), 2000);
      },
    );
  return (
    <div style={S.page}>
      <div style={S.header}>
        <img style={S.logo} src={logoUrl} alt="Mark Player logo" />
        <h1 style={S.title}>Mark Player <span style={S.beta}>{version} beta, by VETKA lab</span></h1>
      </div>
      <p style={S.text}>{SUPPORT_TEXT}</p>
      <p style={S.legend}>{ABOUT_LEGEND}</p>
      <p style={S.roadmapTitle}>Coming next:</p>
      <ul style={S.roadmapList}>
        {ABOUT_ROADMAP.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div style={S.rows}>
        {ROWS.map((row) => (
          <div style={S.row} key={row.key}>
            <button
              style={S.rowValue}
              type="button"
              title={`${row.label} — click to open, Copy to copy`}
              onClick={row.openUrl ? () => void openExternal(row.openUrl!) : undefined}
            >
              {row.label}: {row.value}
            </button>
            <button style={S.copyBtn} type="button" onClick={() => copyRow(row)}>
              {copiedKey === row.key ? "Copied" : "Copy"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <AboutPanel version={typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0"} />
    </StrictMode>,
  );
}
