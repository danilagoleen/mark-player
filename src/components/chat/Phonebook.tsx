// TODO (chat-extract): VETKA-specific imports — adapter required:
//   ../../store/useMCCStore  → @vetka/adapter-store
import { Phone } from "lucide-react";
import { MiniWindow } from "./MiniWindow";
import { ModelDirectory } from "../panels/ModelDirectory";
import { useMCCStore } from "../../store/useMCCStore";

interface PhonebookProps {
  open: boolean;
  onClose: () => void;
  onSelect: (modelId: string, modelName: string, modelSource?: string) => void;
  standalone?: boolean;
}

export function Phonebook({ open, onClose, onSelect, standalone }: PhonebookProps) {
  const favoriteModels = useMCCStore(s => s.favoriteModels);
  const favoriteModelNames = useMCCStore(s => s.favoriteModelNames);

  const directoryContent = (
    <ModelDirectory
      isOpen
      embedded
      onClose={onClose}
      onSelect={(id, name, source) => {
        onSelect(id, name, source);
      }}
    />
  );

  if (standalone) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", height: "100vh",
        background: "#1a1a1a", color: "#ccc", fontSize: 13,
        fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,sans-serif",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)",
          fontSize: 12, fontWeight: 600, color: "#e4e6eb",
        }}>
          Model Directory
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {directoryContent}
        </div>
      </div>
    );
  }

  if (!open) return null;

  return (
    <MiniWindow
      windowId="phonebook"
      title="Model Directory"
      noHeader
      position={{ x: 24, y: 64 }}
      expandedWidth={400}
      expandedHeight={560}
      defaultExpanded
      compactWidth={260}
      compactHeight={80}
      compactContent={
        <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#ccc", flex: 1 }}>
          <Phone size={14} />
          <span>{favoriteModels.length > 0 ? (favoriteModelNames[favoriteModels[0]] || favoriteModels[0]) : "Models"}</span>
        </div>
      }
      expandedContent={directoryContent}
      onClose={onClose}
    />
  );
}
