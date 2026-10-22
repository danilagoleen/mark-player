import { describe, expect, it } from "vitest";
import { exportPlaylistToXmeml } from "../srtUtils";
import type { XmemlPlaylistItemInput } from "../srtUtils";
import palette from "../../tests/conformance/palette_v01/palette.json";
import playlist from "../../tests/conformance/palette_v01/playlist.json";
import probe from "../../tests/conformance/palette_v01/probe.json";
import manifest from "../../tests/conformance/palette_v01/manifest.json";
import expectedXml from "../../tests/conformance/palette_v01/expected.player.xml?raw";

type MarkerInput = XmemlPlaylistItemInput["markers"][number];
type ProbeItem = { durationSec: number; width: number; height: number; hasAudio: boolean };

interface ProjectedMarker {
  name: string;
  comment: string;
  inF: number;
  outF: number;
  color: number | null;
}

interface ProjectedClip {
  name: string;
  path: string;
  inF: number;
  outF: number;
  markers: ProjectedMarker[];
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tag(body: string, name: string): string {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(body);
  return match ? decodeXml(match[1]) : "";
}

function parseProjection(xml: string): ProjectedClip[] {
  const filePaths = new Map<string, string>();
  for (const file of xml.matchAll(/<file id="(file-\d+)">([\s\S]*?)<\/file>/g)) {
    filePaths.set(file[1], tag(file[2], "pathurl").replace("file://localhost", ""));
  }

  const clips: ProjectedClip[] = [];
  for (const clip of xml.matchAll(/<clipitem id="clipitem-(\d+)">([\s\S]*?)<\/clipitem>/g)) {
    const body = clip[2];
    const ownPath = tag(body, "pathurl").replace("file://localhost", "");
    const ref = /<file id="(file-\d+)"\s*\/>/.exec(body)?.[1];
    const markers: ProjectedMarker[] = [];
    for (const marker of body.matchAll(/<marker>([\s\S]*?)<\/marker>/g)) {
      const markerBody = marker[1];
      const color = tag(markerBody, "pproColor");
      markers.push({
        name: tag(markerBody, "name"),
        comment: tag(markerBody, "comment"),
        inF: Number(tag(markerBody, "in")),
        outF: Number(tag(markerBody, "out")),
        color: color ? Number(color) : null,
      });
    }
    clips.push({
      name: tag(body, "name"),
      path: ownPath || (ref ? filePaths.get(ref) ?? "" : ""),
      inF: Number(tag(body, "in")),
      outF: Number(tag(body, "out")),
      markers,
    });
  }
  return clips;
}

function buildPlayerInput(): XmemlPlaylistItemInput[] {
  const probeItems = probe.items as Record<string, ProbeItem>;
  return playlist.entries.map((entry) => {
    const meta = probeItems[entry.path];
    const markers: MarkerInput[] = [
      { marker_id: `${entry.question_id}:in`, kind: "in", start_sec: entry.in_sec, end_sec: entry.in_sec, label: "", text: "" },
      { marker_id: `${entry.question_id}:out`, kind: "out", start_sec: entry.out_sec, end_sec: entry.out_sec, label: "", text: "" },
      ...(entry.markers ?? []).map((marker) => ({
        marker_id: marker.marker_id,
        kind: marker.kind,
        start_sec: marker.t_sec,
        end_sec: marker.t_sec,
        label: marker.label,
        text: marker.text,
      })),
    ];
    return {
      sourcePath: entry.path,
      clipName: entry.name,
      durationSec: meta.durationSec,
      width: meta.width,
      height: meta.height,
      hasAudio: meta.hasAudio,
      markers,
    };
  });
}

function basename(path: string): string {
  return path.split("/").pop() ?? "";
}

describe("palette_v01: контракт и проекция P", () => {
  it("держит канон имени, ref и инвариант блоков", () => {
    expect(palette.contract_version).toBe(manifest.contract_version);
    expect(palette.playlist_schema).toBe(manifest.playlist_schema);
    expect(palette.db_version).toBe(manifest.db_version);
    expect(palette.fps).toBe(manifest.fps);
    expect(playlist.schema).toBe(palette.playlist_schema);
    expect(playlist.entries).toHaveLength(palette.items.length);

    const byId = new Map(palette.items.map((item) => [item.id, item]));
    playlist.entries.forEach((entry, index) => {
      const item = palette.items[index];
      expect(entry.question_id).toBe(item.id);
      expect(entry.name).toBe(basename(entry.path));
      expect(entry.name).toBe(item.ref.media);
      expect(entry.in_sec).toBe(item.ref.in_sec);
      expect(entry.out_sec).toBe(item.ref.out_sec);
      expect(entry.ref).toEqual({
        layer: "palette",
        id: item.id,
        person_id: item.ref.person_id,
        phase: item.ref.phase,
        phase_piece: item.ref.phase_piece,
      });
    });

    let previousBlockEnd = 0;
    palette.bblocks.forEach((block, index) => {
      expect(block.item_ids.length).toBeGreaterThan(0);
      const first = byId.get(block.item_ids[0]);
      expect(first).toBeDefined();
      block.item_ids.forEach((id) => expect(byId.has(id)).toBe(true));
      const duration = block.item_ids.reduce((sum, id) => {
        const item = byId.get(id);
        if (!item) return sum;
        return sum + (item.ref.out_sec - item.ref.in_sec);
      }, 0);
      expect(block.in_sec).toBe(index === 0 ? 0 : previousBlockEnd + 20);
      expect(block.out_sec - block.in_sec).toBe(duration);
      previousBlockEnd = block.out_sec;
    });

    playlist.entries.forEach((entry) => {
      const item = byId.get(entry.question_id);
      expect(item).toBeDefined();
      if (!item) return;
      const title = entry.markers.find((marker) => marker.kind === "comment" && marker.text === item.title);
      expect(title?.t_sec).toBe(item.ref.in_sec);
      const favorite = entry.markers.find((marker) => marker.kind === "favorite");
      expect(Boolean(favorite)).toBe(item.fav);
      if (favorite) expect(favorite.t_sec).toBe(item.ref.in_sec);
    });
  });

  it("совпадает с expected.player.xml по проекции P", () => {
    expect(manifest.projection).toBe(
      "P = XMEML без таймлайновых координат и без фильтров; сравниваются файловые in/out, имена, маркеры, ★ и порядок",
    );
    expect(manifest.expected_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(expectedXml).not.toContain("<filter>");
    expect(expectedXml).not.toContain("Basic Motion");

    const actual = exportPlaylistToXmeml(buildPlayerInput(), {
      fps: manifest.fps,
      seqWidth: manifest.seq_width,
      seqHeight: manifest.seq_height,
      sequenceName: manifest.sequence_name,
    });

    expect(parseProjection(actual)).toEqual(parseProjection(expectedXml));
    expect(parseProjection(actual).map((clip) => clip.name)).toEqual(
      playlist.entries.map((entry) => entry.name),
    );
  });
});
