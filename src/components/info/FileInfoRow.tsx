import type { ProbeResult } from "../../lib/nativeWindow";
import type { FpsHonesty } from "../../srtUtils";

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
  /** tb_1791143015_70644_11: detected container vs authored timeline. */
  honesty?: FpsHonesty | null;
  /** tb_1791143015_70644_7: секунд пропущено In–Out Play за сессию (0 = молчим). */
  skippedSeconds?: number;
}

export function FileInfoRow({ probe, honesty, skippedSeconds }: FileInfoRowProps) {
  const cls = CLASS_CLASSES[probe.playback_class] ?? "class-unknown";
  const icon = CLASS_ICONS[probe.playback_class] ?? "?";

  return (
    <span className={`file-info-row ${cls}`}>
      <span className="fi-icon" title={probe.playback_class}>{icon}</span>
      <span className="fi-codec">{probe.video_codec}</span>
      <span className="fi-res">{probe.width}&times;{probe.height}</span>
      {probe.fps ? <span className="fi-fps">{Number(probe.fps).toFixed(2)} fps</span> : null}
      {honesty ? (
        <span
          className={honesty.mismatch ? "fi-fps-honesty fi-fps-warn" : "fi-fps-honesty"}
          title={
            honesty.mismatch
              ? `Container ${honesty.detected !== null ? honesty.detected.toFixed(2) : "?"} fps, timeline authored as ${honesty.authoredTimebase} NTSC — verify fps in NLE`
              : `Timeline fps ${honesty.authoredTimebase}`
          }
        >
          {honesty.badge}
        </span>
      ) : null}
      {skippedSeconds !== undefined && skippedSeconds > 0 ? (
        <span className="fi-skipped" title="Seconds skipped by In–Out Play this session">
          skipped {skippedSeconds.toFixed(1)}s
        </span>
      ) : null}
    </span>
  );
}
