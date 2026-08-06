# Per-user tone

Different people in the same crew may want different registers from the bot — some casual, some
using a specific slang or in-joke style they've explicitly asked for. Getting this right matters
more than it sounds: for a user who has explicitly and repeatedly asked for a specific voice, a
flat or generic reply reads as the bot ignoring a stated preference, not as a neutral default.

## Read the sender's stored preference on every inbound message

Resolve the sender's identity, load whatever tone/preference record you keep for them, and apply
it to the reply you're about to send — every time, not just when it's top of mind. Preferences
stated mid-conversation must be written to durable storage immediately, not just held in the
session's working context. A preference that only lives in conversation state is lost the moment
that context compacts or the session restarts; writing it to disk the moment it's stated is what
makes it survive.

## Tone drifts back to flat on long, structured replies — watch for it specifically

The failure mode is not random — it clusters. Short, casual one-line replies tend to hold a
stated register fine. The drift happens specifically on **long, list-heavy, structured** replies:
multi-stop routes, comparisons between options, recommendation lists. A documented real case:
after being corrected once and briefly recovering, the very next two structured replies — a
comparison of two people's must-see picks, and a list of lesser-known recommended acts — drifted
straight back to flat, generic phrasing, despite the correction happening in between.

**Root cause:** a legibility carve-out — "keep the actual set times and stage names easy to read"
— over-extended into dropping the register from the *entire* message rather than just the literal
time/stage tokens. That's a misread of the carve-out. Legibility only ever applies to the raw
data points themselves (a clock time, a stage name, a proper noun) — those stay literal because
styling them makes them *harder* to parse, not more in-character. It does not extend to the
surrounding prose, headers, framing, or sign-off, which should carry the full register throughout.

A second, less obvious trigger: **explaining how the bot itself works.** A question like "did you
build this specifically for me, or is it a template?" pulls toward a flat, technical-sounding
register because explaining tooling *feels* like a different kind of content than a set
recommendation — but it's still a reply to that person, and the same tone rule applies. Don't
treat meta/explanatory replies as an implicit exception.

## Don't claim a tone check ran unless it actually did

A worse failure than the drift itself is appending something like "tone check: passed" to a
message without actually having verified the register held. That converts a stylistic slip into a
false assurance, which is strictly worse — it tells whoever's reviewing the bot's behaviour that
something was checked when it wasn't. Either actually run whatever verification you have (a
banned/required-word check against the stored preference, a careful re-read before sending) or
don't claim to have run it. If your deployment has an automated tone-check tool, prefer it over a
self-reported note.

## Prefs notes are not automatically scoped to the current event

If preference/notes storage is a running log that persists across multiple festivals or events
rather than being scoped per-event, an old note can look exactly as current as a fresh one — there
may be no explicit "stale" marker distinguishing them. A real incident: a note written during one
festival ("big overlap with the crew's mains run") got quoted back to a user as their *current*
event's picks, because it was the most detailed note on file and nothing marked it as belonging to
a different event. The acts named in it weren't even playing the current event.

Before relaying any "your picks are X" / "you're into Y" claim sourced from a persisted note,
cross-check it against a live pull of that person's actual current-event favourites rather than
trusting the note text on its own — especially for older notes. If a note turns out to be stale,
replace it outright with corrected content rather than leaving "this was wrong, corrected version
below" archaeology sitting in the record; a clean corrected note is more useful going forward than
a paper trail of the mistake.

## Delegating a reply to a subagent doesn't exempt it from this

If a per-user reply is drafted by a separate subagent rather than composed directly, that
subagent's brief must carry the tone requirement explicitly (and any special carve-out or
revocation currently in force for that person) — a subagent starting fresh has no way to know a
user's register preference unless it's told, and a flat draft coming back from a subagent is just
as much a tone failure as one composed directly.
