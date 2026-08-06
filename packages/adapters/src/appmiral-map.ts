/**
 * Appmiral Content API (v7) map/POI adapter — cross-festival reusable, same host +
 * path template as appmiral.ts (lineup). Covers the `.../maps` and `.../pois`
 * endpoints: a festival's site map is Mapbox/Scribblemaps VECTOR data (POI
 * polygons/points with lat/lng), not a downloadable image asset — confirmed by
 * inspecting every field on a live response (ATN26, 2026-07-22): no image/
 * thumbnail URL anywhere on the map object.
 *
 * Auth is the same static `x-protect` header as the lineup adapter. Unlike the
 * lineup fetch, `httpGet`'s default headers aren't enough here — Appmiral 403s a
 * bare `Python-urllib`/no-UA request, so a browser-ish `User-Agent` is required
 * (curl's UA works fine and is what we send).
 */
import { httpGetJson } from "./http.js";
import type { SitePoi, SiteMapSource } from "@festival-bot/core";

export interface AppmiralMapCategory {
  id: number;
  name: string;
  type: string;
  color?: string;
  show_polygon?: boolean;
  show_marker?: boolean;
  show_in_list?: boolean;
}

export interface AppmiralMap {
  id: number;
  name?: string;
  bounding_box?: { topLeft: { lat: number; lon: number }; bottomRight: { lat: number; lon: number } };
  categories: AppmiralMapCategory[];
}

export interface AppmiralPoiCoord {
  lat: number;
  lng: number;
}

export interface AppmiralPoi {
  id: number;
  name?: string;
  category_id?: number;
  coordinates?: AppmiralPoiCoord[];
  deleted_at?: string;
}

export interface AppmiralMapConfig {
  event: string;
  edition: string;
  xProtect: string;
}

const APPMIRAL_BASE = "https://app.appmiral.com/api/v7";

function headers(xProtect: string): Record<string, string> {
  return {
    "x-protect": xProtect,
    "x-platform": "android",
    "Accept-Language": "en",
    "User-Agent": "curl/8.5.0",
    Accept: "*/*",
  };
}

function editionBase(c: AppmiralMapConfig): string {
  return `${APPMIRAL_BASE}/events/${c.event}/editions/${c.edition}`;
}

/** The site map object (categories + bounding box). `data: []` = not published yet. */
export async function fetchAppmiralMaps(c: AppmiralMapConfig): Promise<AppmiralMap[]> {
  const resp = await httpGetJson<{ data: AppmiralMap[] }>(`${editionBase(c)}/maps`, {
    headers: headers(c.xProtect),
  });
  return resp.data ?? [];
}

/** All non-deleted POIs, paginating via `_links.next` until exhausted. */
export async function fetchAppmiralPois(c: AppmiralMapConfig, maxPerPage = 100): Promise<AppmiralPoi[]> {
  const pois: AppmiralPoi[] = [];
  let url: string | undefined = `${editionBase(c)}/pois?max_per_page=${maxPerPage}`;
  while (url) {
    const resp: { data: AppmiralPoi[]; _links?: { next?: string } } = await httpGetJson(url, {
      headers: headers(c.xProtect),
    });
    pois.push(...(resp.data ?? []).filter((p) => !p.deleted_at));
    url = resp._links?.next;
  }
  return pois;
}

/** Centroid of a POI's polygon/point coordinates. */
export function poiCentroid(coords: AppmiralPoiCoord[]): { lat: number; lng: number } {
  const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const lng = coords.reduce((s, c) => s + c.lng, 0) / coords.length;
  return { lat, lng };
}

/** Great-circle distance in metres. */
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const p1 = (a.lat * Math.PI) / 180;
  const p2 = (b.lat * Math.PI) / 180;
  const dphi = ((b.lat - a.lat) * Math.PI) / 180;
  const dlmb = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dlmb / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/**
 * Wrap the Appmiral map endpoints as a vendor-agnostic SiteMapSource.
 *
 * Appmiral gives a POI a polygon; the planner wants a point, so each is reduced
 * to its centroid. Deleted POIs are dropped — the endpoint keeps tombstones.
 */
export function createAppmiralMapSource(c: AppmiralMapConfig): SiteMapSource {
  return {
    async loadPois(): Promise<SitePoi[]> {
      const [maps, pois] = await Promise.all([fetchAppmiralMaps(c), fetchAppmiralPois(c)]);
      const categoryName = new Map<number, string>();
      for (const m of maps) for (const cat of m.categories ?? []) categoryName.set(cat.id, cat.name);

      const out: SitePoi[] = [];
      for (const p of pois) {
        if (p.deleted_at) continue;
        if (!p.coordinates?.length) continue;
        const { lat, lng } = poiCentroid(p.coordinates);
        out.push({
          id: String(p.id),
          name: p.name ?? "",
          category: (p.category_id !== undefined ? categoryName.get(p.category_id) : undefined) ?? "",
          lat,
          lng,
        });
      }
      return out;
    },
  };
}
