/**
 * @festival-bot/data — cross-festival people-data stores (users, prefs,
 * reminders). File-backed JSON under data/ in a stable on-disk format.
 */
export * from "./paths.js";
export * from "./users.js";
export * from "./prefs.js";
export * from "./reminders.js";
export * from "./personal-events.js";
export { parseChannel } from "./channel.js";
