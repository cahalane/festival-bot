/**
 * @festival-bot/adapters — reusable data-source adapters.
 *
 * Two kinds live here, and the distinction matters:
 *
 *   - **Festival-independent**: Open-Meteo weather, the generic Clashfinder client,
 *     MusicBrainz, the shared HTTP/cache helper, BlueSky announcements.
 *   - **Vendor-specific but multi-festival**: Appmiral (`appmiral*.ts`) and Primavera
 *     (`primavera*.ts`). One vendor serves many festivals *and* many editions of the
 *     same festival, so the integration outlives any single `festivals/<slug>/` pack.
 *
 * What stays in a festival module is only what genuinely differs per edition: the
 * declarative pack (dates, venues, knowledge) and a few event ids. If you find
 * yourself copying a whole adapter into next year's module, it belongs here instead.
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
export * from "./bluesky.js";
export * from "./primavera-graphql.js";
export * from "./primavera-lineup.js";
export * from "./primavera-posts.js";
export * from "./primavera-artist-info.js";
export * from "./primavera-spotify.js";
