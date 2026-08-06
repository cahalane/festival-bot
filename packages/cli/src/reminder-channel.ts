/**
 * Which channel a queued reminder should be delivered on.
 *
 * `reminders add` takes a bare id on the command line (historically a Telegram
 * chat id) but the KIND that id belongs to must come from the person's own
 * stored profile, not be assumed — a deployment running multiple channel
 * plugins would otherwise queue every reminder as if it were Telegram,
 * silently misdelivering anyone reachable elsewhere.
 */
import type { ChannelRef } from "@festival-bot/core";

/** The kind assumed when a handle has no stored channel at all (legacy default). */
const FALLBACK_KIND = "telegram";

/**
 * Build the channel ref to store on a new reminder: the kind from the
 * person's stored profile (`stored`, from `channelOf(handle)`) paired with
 * the id given on the command line — falling back to the legacy Telegram
 * default only when the person has no stored channel to read a kind from.
 */
export function reminderChannel(id: string, stored: ChannelRef | undefined): ChannelRef {
  return { kind: stored?.kind ?? FALLBACK_KIND, id };
}
