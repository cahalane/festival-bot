/**
 * Site-map points of interest, vendor-agnostic.
 *
 * A festival module supplies POIs however it can (a vendor API, a KML export, a
 * hand-written JSON file); everything downstream — the publish watch, the
 * amenities report, walk-graph refinement — works off this shape and never sees
 * the vendor.
 */

export interface SitePoi {
  id: string;
  name: string;
  /** Vendor's own category label, e.g. "Toilets", "Stages". */
  category: string;
  lat: number;
  lng: number;
  /**
   * This POI is part of the map's decorative/raster backdrop rather than a
   * place, as determined by the source from whatever vendor signals it has
   * (e.g. an overlay-image field) — independent of, and in addition to, the
   * category signal. A generic map concept, not an Appmiral one.
   */
  backdrop?: boolean;
}

export interface SiteMapSource {
  /** All published POIs. Empty array = nothing published yet (not an error). */
  loadPois(): Promise<SitePoi[]>;
}

/**
 * Categories that describe the raster backdrop rather than a place. A map made
 * only of these has no information in it, however many rows it returns.
 */
const BACKDROP_CATEGORIES = new Set(["map_overlay_image"]);

/**
 * A backdrop tile is identified two ways (either is enough): it carries
 * `backdrop: true` (a source-determined vendor signal, e.g. an overlay
 * image), or it sits in one of `BACKDROP_CATEGORIES`.
 */
export function isBackdrop(p: SitePoi): boolean {
  return p.backdrop === true || BACKDROP_CATEGORIES.has(p.category);
}

/** Has this map published anything that tells you where something IS? */
export function poisPublished(pois: SitePoi[]): boolean {
  return pois.some((p) => !isBackdrop(p));
}
