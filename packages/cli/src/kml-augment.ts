/**
 * `festplan kml-augment --in FILE [--out FILE]` — merge ATN's real POI
 * coordinates into an existing Google My Maps KML export.
 *
 * The operator took `festplan kml` output into My Maps, reorganised it
 * (splitting Stages into Music and Experience) and sent it back to be
 * augmented with the coordinates ATN published on 2026-07-29. So this edits
 * THEIR document rather than regenerating ours: their layer structure, naming
 * and styling are the things to preserve, and anything we add should look
 * like it belongs.
 *
 * Everything is done as text surgery rather than parse-and-reserialise. My Maps
 * emits its own StyleMap/normal/highlight scaffolding, and a round-trip through
 * a generic XML writer would quietly reformat or drop parts of it. Operating on
 * text keeps the file byte-identical everywhere we don't deliberately touch.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cacheDir } from "./config.js";
import { ACTIVE_FESTIVAL } from "./festivals.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const unwrap = (s: string): string => s.replace(/<!\[CDATA\[|\]\]>/g, "").trim();

/** Folder names in document order, CDATA unwrapped. */
export function folderNames(kml: string): string[] {
  return [...kml.matchAll(/<Folder>[\s\S]*?<name>([\s\S]*?)<\/name>/g)].map((m) => unwrap(m[1]!));
}

export interface NewPlacemark {
  name: string;
  lat: number;
  lng: number;
  description?: string;
  styleUrl?: string;
}

export function placemarkXml(p: NewPlacemark): string {
  const desc = p.description ? `\n        <description>${esc(p.description)}</description>` : "";
  const style = p.styleUrl ? `\n        <styleUrl>${esc(p.styleUrl)}</styleUrl>` : "";
  return `      <Placemark>
        <name>${esc(p.name)}</name>${desc}${style}
        <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>
      </Placemark>`;
}

/** Locate one folder's [start, end) span in the document, or null. */
function folderSpan(kml: string, folderName: string): { start: number; end: number } | null {
  const re = /<Folder>[\s\S]*?<\/Folder>/g;
  for (let m = re.exec(kml); m; m = re.exec(kml)) {
    const nameMatch = /<name>([\s\S]*?)<\/name>/.exec(m[0]);
    if (nameMatch && unwrap(nameMatch[1]!) === folderName) {
      return { start: m.index, end: m.index + m[0].length };
    }
  }
  return null;
}

/** Drop placemarks whose name satisfies `match`, but ONLY inside `folderName`. */
export function removePlacemarksIn(
  kml: string,
  folderName: string,
  match: (name: string) => boolean,
): string {
  const span = folderSpan(kml, folderName);
  if (!span) return kml;
  const body = kml.slice(span.start, span.end);
  const pruned = body.replace(/[ \t]*<Placemark>[\s\S]*?<\/Placemark>\n?/g, (pm) => {
    const n = /<name>([\s\S]*?)<\/name>/.exec(pm);
    return n && match(unwrap(n[1]!)) ? "" : pm;
  });
  return kml.slice(0, span.start) + pruned + kml.slice(span.end);
}

/** Append placemarks just before the folder's closing tag. */
export function injectIntoFolder(kml: string, folderName: string, placemarks: string[]): string {
  const span = folderSpan(kml, folderName);
  // Throwing beats silently dropping: if a folder gets renamed in My Maps, the
  // additions would vanish without a trace and nobody would notice until they
  // went looking for a water tap that wasn't on the map.
  if (!span) throw new Error(`folder "${folderName}" not found in the KML`);
  if (!placemarks.length) return kml;
  const body = kml.slice(span.start, span.end);
  const insertAt = body.lastIndexOf("</Folder>");
  const merged = body.slice(0, insertAt) + placemarks.join("\n") + "\n    " + body.slice(insertAt);
  return kml.slice(0, span.start) + merged + kml.slice(span.end);
}

interface Poi {
  name?: string;
  coordinates?: Array<{ lat: number; lng: number }>;
}

function centroid(c: Array<{ lat: number; lng: number }>) {
  return {
    lat: c.reduce((s, x) => s + x.lat, 0) / c.length,
    lng: c.reduce((s, x) => s + x.lng, 0) / c.length,
  };
}

/** Style reused for additions in a folder: whatever its existing placemarks use. */
function dominantStyle(kml: string, folderName: string): string | undefined {
  const span = folderSpan(kml, folderName);
  if (!span) return undefined;
  const body = kml.slice(span.start, span.end);
  const counts = new Map<string, number>();
  for (const m of body.matchAll(/<styleUrl>(.*?)<\/styleUrl>/g)) {
    counts.set(m[1]!, (counts.get(m[1]!) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const OFFICIAL = "Official ATN coordinate (site map POI data, 2026-07-29).";

/**
 * What goes where. Each entry names ATN POIs to copy into one of the existing folders,
 * and optionally the estimated placemarks they supersede — our hand-read guesses
 * are strictly worse than a published coordinate, and keeping both would leave
 * two pins a few metres apart claiming to be the same tap.
 */
const PLAN: Array<{
  folder: string;
  take: string[];
  replace?: (existingName: string) => boolean;
}> = [
  {
    folder: "Facilities",
    take: ["Water Station", "Toilets", "Showers", "Medical Tent", "Info Tent", "Lost & Found"],
    replace: (n) => /^Drinking water \(|^Toilets \(|^Showers \(|^Medical \(|^Info point \(/.test(n),
  },
  {
    folder: "Food & drink",
    take: ["Food Stalls", "White Claw Bar", "Altos Tequila", "Smirnoff Bar", "Izakaya Japas & Sake", "Craft Cocktails Bar", "Merch Tent"],
  },
  {
    folder: "Experiences",
    take: ["Kids Together", "Ferris Wheel", "Guest Area", "Both Sides Now", "The Sibins x Hometree", "Seanchoiche", "All Curious Minds"],
  },
  { folder: "Campsites & car parks", take: ["Pod Pads Pre-Pitched"] },
];

export function runKmlAugment(args: string[]): void {
  const inIdx = args.indexOf("--in");
  const outIdx = args.indexOf("--out");
  const inFile = inIdx >= 0 ? args[inIdx + 1] : undefined;
  const outFile = outIdx >= 0 ? args[outIdx + 1] : inFile;
  if (!inFile || !existsSync(inFile)) return void console.log("usage: festplan kml-augment --in <file.kml> [--out <file.kml>]");

  const raw = join(cacheDir(ACTIVE_FESTIVAL), "map_raw.json");
  if (!existsSync(raw)) return void console.log(`no map POI data cached (${raw} missing)`);
  const pois = (JSON.parse(readFileSync(raw, "utf8")) as { pois: Poi[] }).pois.filter(
    (p) => p.coordinates && p.coordinates.length > 0,
  );

  let kml = readFileSync(inFile, "utf8");
  const have = new Set(folderNames(kml));
  let added = 0;
  let removed = 0;

  for (const step of PLAN) {
    if (!have.has(step.folder)) {
      console.log(`  skipped "${step.folder}" — no such folder in this document`);
      continue;
    }
    if (step.replace) {
      const before = (kml.match(/<Placemark>/g) ?? []).length;
      kml = removePlacemarksIn(kml, step.folder, step.replace);
      removed += before - (kml.match(/<Placemark>/g) ?? []).length;
    }
    const style = dominantStyle(kml, step.folder);
    const marks: string[] = [];
    for (const wanted of step.take) {
      const matches = pois.filter((p) => (p.name ?? "").trim() === wanted);
      matches.forEach((p, i) => {
        const c = centroid(p.coordinates!);
        marks.push(
          placemarkXml({
            name: matches.length > 1 ? `${wanted} ${i + 1}` : wanted,
            lat: c.lat,
            lng: c.lng,
            description: OFFICIAL,
            styleUrl: style,
          }),
        );
      });
    }
    kml = injectIntoFolder(kml, step.folder, marks);
    added += marks.length;
    console.log(`  ${step.folder}: +${marks.length}`);
  }

  writeFileSync(outFile!, kml);
  console.log(`wrote ${outFile} — ${added} official POIs added, ${removed} estimated ones replaced`);
}
