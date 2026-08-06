/**
 * KML export of every known point of interest — for importing into Google My Maps.
 *
 * Operator ask, 2026-07-29: "Can you make me a custom Google Map with all the
 * points of interest?" My Maps has no creation API, but it imports KML, so
 * that is the handoff: we emit the file, it gets imported in a few seconds and
 * the map is owned from there.
 *
 * The catch is that our POI positions are PIXELS on ATN's site-map image, not
 * coordinates. They are converted through the same bridge used to place Craft
 * Cocktails: a least-squares fit against stages whose real 2025 coordinates we
 * still hold. That fit carried a worst residual of ~29px (~23m) across 15
 * control points, so every exported pin is good to roughly that — fine for
 * finding a bar by eye, not survey data, and the export says so.
 */

export interface Control {
  px: number;
  py: number;
  lat: number;
  lng: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place extends LatLng {
  name: string;
  description?: string;
  /** Style id, so several pin types can share one My Maps layer. */
  styleId?: string;
}

export interface KmlStyle {
  id: string;
  /** Icon tint, #rrggbb. */
  color?: string;
  /** Icon image URL (Google's kml/shapes/*.png are the ones My Maps knows). */
  icon?: string;
  /** Polygon fill, #rrggbb — rendered translucent. */
  polyFill?: string;
  /** Polygon outline, #rrggbb — rendered opaque. */
  polyOutline?: string;
}

/**
 * #rrggbb -> KML's `aabbggrr`.
 *
 * KML stores colour in the OPPOSITE byte order to CSS, so passing a web colour
 * straight through silently renders red as blue. Alpha leads rather than trails.
 */
export function kmlColor(hex: string, alpha = 1): string {
  const h = hex.replace(/^#/, "");
  const rr = h.slice(0, 2);
  const gg = h.slice(2, 4);
  const bb = h.slice(4, 6);
  const aa = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${aa}${bb}${gg}${rr}`;
}

export interface Area {
  name: string;
  /** Boundary vertices, stored OPEN — buildKml closes the ring. */
  ring: LatLng[];
  description?: string;
  styleId?: string;
}

export interface Folder {
  name: string;
  places: Place[];
  areas?: Area[];
}

/** Least-squares slope/intercept for y = m*x + c. */
function linearFit(xs: number[], ys: number[]): [number, number] {
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, b, i) => a + b * ys[i]!, 0);
  const denom = n * sxx - sx * sx;
  const m = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  return [m, (sy - m * sx) / n];
}

/**
 * Fit pixel -> lat/lng from control points.
 *
 * Axis-independent linear fits are enough here: the site map is drawn
 * north-up and unrotated, so x maps to longitude and y to latitude without a
 * cross term. If a future map is rotated this needs a full affine fit — the
 * giveaway would be residuals growing towards the corners.
 */
export function fitStaticToLatLng(controls: Control[]): (px: number, py: number) => LatLng {
  if (controls.length < 2) throw new Error("need at least 2 control points to fit a projection");
  const [mLng, cLng] = linearFit(controls.map((c) => c.px), controls.map((c) => c.lng));
  const [mLat, cLat] = linearFit(controls.map((c) => c.py), controls.map((c) => c.lat));
  return (px, py) => ({ lat: mLat * py + cLat, lng: mLng * px + cLng });
}

/** Worst control-point residual, in metres — the export's honest accuracy claim. */
export function fitResidualMetres(controls: Control[]): number {
  const f = fitStaticToLatLng(controls);
  const R = 111_320;
  let worst = 0;
  for (const c of controls) {
    const p = f(c.px, c.py);
    const dy = (p.lat - c.lat) * R;
    const dx = (p.lng - c.lng) * R * Math.cos((c.lat * Math.PI) / 180);
    worst = Math.max(worst, Math.hypot(dx, dy));
  }
  return worst;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function styleBlock(s: KmlStyle): string {
  const parts: string[] = [];
  if (s.icon || s.color) {
    const tint = s.color ? `\n        <color>${kmlColor(s.color)}</color>` : "";
    const href = s.icon ? `\n        <Icon><href>${esc(s.icon)}</href></Icon>` : "";
    parts.push(`      <IconStyle>${tint}\n        <scale>1.1</scale>${href}\n      </IconStyle>`);
  }
  if (s.polyFill) {
    // Translucent fill: areas overlap and sit on top of the basemap, and an
    // opaque fill hides both the terrain and any pin inside the area.
    parts.push(`      <PolyStyle>\n        <color>${kmlColor(s.polyFill, 0.35)}</color>\n        <fill>1</fill>\n        <outline>1</outline>\n      </PolyStyle>`);
  }
  if (s.polyOutline) {
    parts.push(`      <LineStyle>\n        <color>${kmlColor(s.polyOutline)}</color>\n        <width>2</width>\n      </LineStyle>`);
  }
  return `    <Style id="${esc(s.id)}">\n${parts.join("\n")}\n    </Style>`;
}

export function buildKml(docName: string, folders: Folder[], styles: KmlStyle[] = []): string {
  const body = folders
    .filter((f) => f.places.length > 0 || (f.areas?.length ?? 0) > 0) // no dead layers
    .map((f) => {
      const areas = (f.areas ?? [])
        .map((a) => {
          if (a.ring.length < 3) throw new Error(`area "${a.name}" needs at least 3 vertices`);
          // A LinearRing must be CLOSED: first vertex repeated at the end. Rings
          // are stored open so tracing doesn't have to remember to duplicate.
          const ring = [...a.ring, a.ring[0]!];
          const coords = ring.map((v) => `${v.lng},${v.lat},0`).join(" ");
          const desc = a.description ? `\n        <description>${esc(a.description)}</description>` : "";
          const su = a.styleId ? `\n        <styleUrl>#${esc(a.styleId)}</styleUrl>` : "";
          return `      <Placemark>
        <name>${esc(a.name)}</name>${desc}${su}
        <Polygon><outerBoundaryIs><LinearRing>
          <coordinates>${coords}</coordinates>
        </LinearRing></outerBoundaryIs></Polygon>
      </Placemark>`;
        })
        .join("\n");

      const places = f.places
        .map((p) => {
          const desc = p.description ? `\n        <description>${esc(p.description)}</description>` : "";
          const su = p.styleId ? `\n        <styleUrl>#${esc(p.styleId)}</styleUrl>` : "";
          // KML is lng,lat,altitude — the reverse of how everyone says it aloud.
          return `      <Placemark>
        <name>${esc(p.name)}</name>${desc}${su}
        <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>
      </Placemark>`;
        })
        .join("\n");

      const inner = [areas, places].filter(Boolean).join("\n");
      return `    <Folder>\n      <name>${esc(f.name)}</name>\n${inner}\n    </Folder>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${esc(docName)}</name>
${styles.map(styleBlock).join("\n")}${styles.length ? "\n" : ""}${body}
  </Document>
</kml>
`;
}
