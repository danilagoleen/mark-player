import type { ProbeResult } from "../../lib/nativeWindow";

const CLASS_ICONS: Record<string, string> = {
  native: "\u25B6",
  proxy: "\u21C6",
  transcode: "\u2699",
};

const CLASS_CLASSES: Record<string, string> = {
  native: "class-native",
  proxy: "class-proxy",
  transcode: "class-transcode",
};

interface FileInfoRowProps {
  probe: ProbeResult;
}

export function FileInfoRow({ probe }: FileInfoRowProps) {
  const cls = CLASS_CLASSES[probe.playback_class] ?? "class-unknown";
  const icon = CLASS_ICONS[probe.playback_class] ?? "?";

  return (
    <span className={`file-info-row ${cls}`}>
      <span className="fi-icon" title={probe.playback_class}>{icon}</span>
      <span className="fi-codec">{probe.video_codec}</span>
      <span className="fi-res">{probe.width}&times;{probe.height}</span>
      {probe.fps ? <span className="fi-fps">{Number(probe.fps).toFixed(2)} fps</span> : null}
    </span>
  );
}
