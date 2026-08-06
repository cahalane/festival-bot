/**
 * `festplan pin "<query>" ["<query>" ...] [--png FILE]` — the official ATN site
 * map, cropped around the places asked for, with each one pinned and labelled.
 *
 * A crew member, live on site, 2026-07-31: "show me a map of ATN with this
 * must be the place campsite and the sauna pinned". Every previous version of this answer
 * was prose — "west of the arena, behind Arty Party" — which is fine for one
 * landmark and useless for two.
 *
 * This is the INVERSE of what the KML export does. That converts site-map pixels
 * to coordinates for Google My Maps; this converts ATN's published coordinates
 * back onto the composite raster so a pin lands on the artwork. The composite
 * georeference is shared with kml-export.ts and was validated before use: ATN's
 * five general car park POIs project to within 47-118px (~15-38m) of the label
 * centres read off the raster by hand, which is hand-read-label accuracy rather
 * than fit error.
 *
 * Rendering goes through chromium like the other cards — the box is a Pi and the
 * project deliberately carries no image dependency (no sharp, no canvas).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeCardPng } from "./card.js";
import { cacheDir } from "./config.js";
import { ACTIVE_FESTIVAL } from "./festivals.js";

export interface Geo {
  /** South edge. */
  lat0: number;
  /** North edge. */
  lat1: number;
  /** West edge. */
  lng0: number;
  /** East edge. */
  lng1: number;
  w: number;
  h: number;
}

/**
 * The composite raster's corners, from the Appmiral overlay tiles. Same numbers
 * as kml-export.ts's COMPOSITE — that one goes pixels->coordinates, this one
 * goes back.
 */
export const ATN_COMPOSITE: Geo = {
  lat0: 52.2838361,
  lat1: 52.3056716,
  lng0: -7.3829981,
  lng1: -7.3544336,
  w: 6000,
  h: 7500,
};

export interface Pixel {
  px: number;
  py: number;
}

/** Width/height from a JPEG's SOF marker, or null if there isn't one. */
export function jpegSize(buf: Buffer): { w: number; h: number } | null {
  // `i + 9 <= length`, not `i < length - 9`: the SOF can be the last segment in
  // the file, and the stricter bound walks straight past it.
  for (let i = 2; i + 9 <= buf.length; ) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1]!;
    // SOFn carries the frame size; C4/C8/CC are tables and codings, not frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/**
 * Refuse a backdrop whose proportions disagree with the georeference.
 *
 * This exists because of a real near-miss (2026-07-31): the cached
 * `site_map_2026.jpg` is a 3000x3000 single tile, not the 6000x7500 composite
 * the coordinates are anchored to. Nothing errored — the square was simply
 * stretched into a 0.8 frame and every pin slid vertically, producing a map
 * that looked authoritative and pointed at the wrong fields. Scale is fine
 * (a downscaled composite is still the composite); SHAPE is the tell.
 */
export function assertGeoFitsImage(imgW: number, imgH: number, geo: Geo, tolerance = 0.02): void {
  const want = geo.w / geo.h;
  const got = imgW / imgH;
  if (Math.abs(got - want) / want > tolerance) {
    throw new Error(
      `site-map raster ${imgW}x${imgH} (aspect ${got.toFixed(3)}) does not match the georeference ` +
        `${geo.w}x${geo.h} (aspect ${want.toFixed(3)}) — this is a different image, not a rescale. ` +
        `Pins would be placed on the wrong part of the site.`,
    );
  }
}

/** Coordinates -> composite pixels. Latitude runs the opposite way to y. */
export function compositeToPixel(lat: number, lng: number, geo: Geo): Pixel {
  return {
    px: ((lng - geo.lng0) / (geo.lng1 - geo.lng0)) * geo.w,
    py: ((geo.lat1 - lat) / (geo.lat1 - geo.lat0)) * geo.h,
  };
}

interface PoiLike {
  name?: string;
  coordinates?: Array<{ lat: number; lng: number }>;
}

export interface Pin {
  name: string;
  lat: number;
  lng: number;
}

/**
 * Resolve free-text queries to pinnable places, in the ORDER ASKED.
 *
 * Unmatched queries come back rather than being dropped: a map showing one of
 * the two places someone asked for looks like a complete answer while being
 * half of one, and they would only find out by walking somewhere wrong.
 */
export function resolvePins(pois: PoiLike[], queries: string[]): { pins: Pin[]; unmatched: string[] } {
  const pins: Pin[] = [];
  const unmatched: string[] = [];

  for (const q of queries) {
    const needle = q.toLowerCase().trim();
    const hit = pois.find(
      (p) => (p.name ?? "").toLowerCase().includes(needle) && p.coordinates && p.coordinates.length > 0,
    );
    if (!hit) {
      unmatched.push(q);
      continue;
    }
    const c = hit.coordinates!;
    pins.push({
      name: hit.name!,
      lat: c.reduce((s, x) => s + x.lat, 0) / c.length,
      lng: c.reduce((s, x) => s + x.lng, 0) / c.length,
    });
  }
  return { pins, unmatched };
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Smallest window holding every pin, padded for context, clamped to the image.
 *
 * `minPx` stops a single pin (or two pins almost on top of each other) from
 * producing a crop so tight it shows nothing recognisable around it.
 */
export function cropBox(points: Pixel[], geo: Geo, opts: { padPx: number; minPx: number }): Box {
  const xs = points.map((p) => p.px);
  const ys = points.map((p) => p.py);
  let x0 = Math.min(...xs) - opts.padPx;
  let x1 = Math.max(...xs) + opts.padPx;
  let y0 = Math.min(...ys) - opts.padPx;
  let y1 = Math.max(...ys) + opts.padPx;

  const grow = (a: number, b: number, min: number, limit: number): [number, number] => {
    const short = min - (b - a);
    if (short > 0) {
      a -= short / 2;
      b += short / 2;
    }
    // Clamp by SHIFTING first so the window keeps its size where the image
    // allows, and only shrink once it genuinely exceeds the image.
    if (b - a >= limit) return [0, limit];
    if (a < 0) return [0, b - a];
    if (b > limit) return [limit - (b - a), limit];
    return [a, b];
  };

  [x0, x1] = grow(x0, x1, opts.minPx, geo.w);
  [y0, y1] = grow(y0, y1, opts.minPx, geo.h);
  return { x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
}

const PIN_COLOURS = ["#D94F3D", "#2E7DD1", "#3F9E4D", "#C2379C", "#D9A244"];

/** The cropped map with absolutely-positioned pins, as a standalone HTML page. */
export function buildPinHtml(
  imgDataUri: string,
  box: Box,
  pins: Array<Pin & Pixel>,
  outW: number,
  caption: string,
  imageW = ATN_COMPOSITE.w,
): string {
  const scale = outW / box.w;
  const outH = Math.round(box.h * scale);
  const markers = pins
    .map((p, i) => {
      const x = (p.px - box.x) * scale;
      const y = (p.py - box.y) * scale;
      const c = PIN_COLOURS[i % PIN_COLOURS.length];
      // Label flips to the left near the right edge so it can't run off frame.
      const flip = x > outW * 0.62;
      return `
  <div class="pin" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px">
    <div class="dot" style="background:${c}"></div>
    <div class="lbl ${flip ? "left" : ""}" style="border-color:${c}">${p.name
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")}</div>
  </div>`;
    })
    .join("");

  return `<html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${outW}px;background:#0E1412;font-family:"DejaVu Sans",system-ui,sans-serif}
  .map{position:relative;width:${outW}px;height:${outH}px;overflow:hidden}
  .map img{position:absolute;left:${(-box.x * scale).toFixed(1)}px;top:${(-box.y * scale).toFixed(1)}px;
    width:${(imageW * scale).toFixed(1)}px;height:auto;image-rendering:auto}
  .pin{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:8px}
  .dot{width:26px;height:26px;border-radius:50%;border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.6);flex:none}
  .lbl{background:rgba(14,20,18,.93);color:#fff;font-size:22px;font-weight:600;padding:7px 13px;
    border-radius:7px;border-left:5px solid;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.5)}
  .lbl.left{order:-1;border-left:none;border-right:5px solid}
  .cap{color:#8B978F;font-size:19px;padding:13px 18px;line-height:1.45}
</style></head><body>
  <div class="map"><img src="${imgDataUri}">${markers}
  </div>
  <div class="cap">${caption}</div>
</body></html>`;
}

export function runPinMap(args: string[]): void {
  const pngIdx = args.indexOf("--png");
  const outFile = (pngIdx >= 0 ? args[pngIdx + 1] : undefined) ?? join(cacheDir(ACTIVE_FESTIVAL), "pin_map.png");
  const queries = args.filter((a, i) => !a.startsWith("--") && i !== pngIdx + 1);

  if (!queries.length) return void console.log('usage: festplan pin "<place>" ["<place>" ...] [--png FILE]');

  const rawFile = join(cacheDir(ACTIVE_FESTIVAL), "map_raw.json");
  if (!existsSync(rawFile)) return void console.log(`no map data cached (${rawFile} missing) — run map-check first.`);
  // The COMPOSITE, not `site_map_2026.jpg` — that one is a single 3000x3000
  // tile and only the stitched raster shares the georeference's frame.
  const imgFile = join(cacheDir(ACTIVE_FESTIVAL), "site_map_composite.jpg");
  if (!existsSync(imgFile)) return void console.log(`no composite site-map raster cached (${imgFile} missing).`);

  const { pois } = JSON.parse(readFileSync(rawFile, "utf8")) as { pois: PoiLike[] };
  const { pins, unmatched } = resolvePins(pois, queries);
  for (const u of unmatched) console.log(`no POI matching "${u}"`);
  if (!pins.length) return void console.log("nothing to pin.");

  const placed = pins.map((p) => ({ ...p, ...compositeToPixel(p.lat, p.lng, ATN_COMPOSITE) }));
  const box = cropBox(placed, ATN_COMPOSITE, { padPx: 520, minPx: 1500 });

  const OUT_W = 1200;
  const imgBuf = readFileSync(imgFile);
  const size = jpegSize(imgBuf);
  if (!size) return void console.log(`could not read the dimensions of ${imgFile}`);
  assertGeoFitsImage(size.w, size.h, ATN_COMPOSITE);
  const dataUri = `data:image/jpeg;base64,${imgBuf.toString("base64")}`;
  const caption =
    `Official ATN site map. Pin positions are ATN's own published coordinates (±~30m).` +
    (unmatched.length ? ` Not found: ${unmatched.join(", ")}.` : "");
  const html = buildPinHtml(dataUri, box, placed, OUT_W, caption);

  writeCardPng(html, outFile, Math.round((box.h / box.w) * OUT_W) + 60, OUT_W);
  for (const p of placed) console.log(`pinned ${p.name} (${p.lat.toFixed(6)}, ${p.lng.toFixed(6)})`);
  console.log(`wrote ${outFile}`);
}
