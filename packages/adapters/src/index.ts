/**
 * @festival-bot/adapters — cross-festival reusable data-source adapters.
 *
 * Only genuinely festival-independent implementations live here (Open-Meteo
 * weather, a generic Clashfinder client, the shared HTTP/cache helper).
 * Festival-specific adapters live inside each festival's own module.
 */
export * from "./http.js";
export * from "./retry.js";
export * from "./refresh.js";
export * from "./pack.js";
export * from "./weather.js";
export * from "./clashfinder.js";
export * from "./favourites.js";
export * from "./clashfinder-export.js";
export * from "./musicbrainz.js";
export * from "./appmiral.js";
export * from "./appmiral-map.js";
export * from "./setlistfm.js";
export * from "./appmiral-news.js";
