/**
 * @festival-bot/core — festival-agnostic planning engine.
 *
 * Pure logic over abstract models (no festival facts, no I/O). A festival module
 * supplies the calendar, walk graph, tunables and data; adapters supply external
 * data behind the interfaces in ./sources.
 */
export * from "./models.js";
export type { ChannelRef } from "./channel-ref.js";
export * from "./time.js";
export * from "./walk.js";
export * from "./favourites.js";
export * from "./personal-events.js";
export * from "./planner.js";
export * from "./reminders.js";
export * from "./vibecheck.js";
export * from "./schedule-watch.js";
export * from "./sources.js";
export * from "./festival.js";
export { poisPublished } from "./sitemap.js";
export type { SitePoi, SiteMapSource } from "./sitemap.js";
