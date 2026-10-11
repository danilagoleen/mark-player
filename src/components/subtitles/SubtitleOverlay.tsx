import type { SubtitleCue } from "../../lib/subtitles";

interface SubtitleOverlayProps {
  cues: SubtitleCue[];
  /** Высота видимого кадра — размер шрифта едет от неё (fullscreen/mini/вертикаль). */
  frameHeight: number;
  /** Подъём над видимым транспортом, px. 0/undefined — базовые 8% кадра. */
  liftPx?: number;
}

// tb_1791156671_82609_1: оверлей дорожки. Белый текст на тёмной подложке,
// без цвета (правило UI). Нет реплики — нет подложки (null).
// tb_1791172090_2308_6 п.2: когда транспорт виден, он перекрывает низ кадра —
// оверлей поднимается над ним на liftPx, иначе возвращается на 8%.
export function SubtitleOverlay({ cues, frameHeight, liftPx }: SubtitleOverlayProps) {
  if (!cues.length) return null;
  const fontPx = Math.max(14, Math.min(48, Math.round(frameHeight * 0.045)));
  return (
    <div
      className="subtitle-overlay"
      data-testid="subtitle-overlay"
      style={liftPx ? { bottom: `calc(8% + ${liftPx}px)` } : undefined}
    >
      {cues.map((c, i) => (
        <div key={`${c.start}-${i}`} className="subtitle-cue" style={{ fontSize: fontPx }}>
          {c.text}
        </div>
      ))}
    </div>
  );
}
