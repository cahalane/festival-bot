# Channel etiquette

The bot's front door is a chat channel plugin (Telegram or similar) wired into the assistant
session. This file covers the mechanical discipline of using that channel correctly — separate from
*what* to say (see [`per-user-tone.md`](per-user-tone.md), [`data-accuracy.md`](data-accuracy.md))
or *who's allowed to say it* (see [`privacy-and-access.md`](privacy-and-access.md)).

## Every user-facing message goes through the reply tool

The single most repeated operational slip in running this bot live: composing a reply as plain
transcript prose instead of calling the channel plugin's reply tool. **Transcript output never
reaches the user.** The channel is a separate surface from the assistant's own reasoning output —
if the message body isn't inside a tool call addressed to the sender's chat id, nobody sees it.

This happened at least half a dozen times over two festivals, including replies to the operator
themselves. That's the specific trap worth naming: when the operator is also the one who can see
the terminal directly, a message from them over the channel starts to feel like "operator
discussion" rather than a real inbound message, and the temptation is to just think out loud in
prose and consider that an answer. It isn't. The operator reading the channel sees exactly what
any other user sees — nothing — until the reply tool fires.

**The mechanical gate:** if the inbound message carries a channel tag (chat id, source, etc.),
your first user-facing action that turn is a reply-tool call, full stop. Do whatever
tool-gathering or reasoning you need first, but the actual answer goes into the reply call, never
into surrounding prose. After answering a channel message, check that a reply call actually
happened before considering the turn done — it's cheap to verify and expensive to skip.

## The channel has no history

Most bot/chat APIs expose no server-side search or history endpoint — a session only sees
messages as they arrive live. If the session restarts, gets cleared, or compacts its context, the
only durable record of what was said is whatever you wrote to disk yourself (a per-user log, a
notes file, a preferences store). Bot code and configuration survive a fresh session fine; the
*conversation* does not, unless you deliberately persisted it.

Practically: render a per-user log as you go (a simple append-only transcript per handle is
enough), and on a fresh or cleared session, if a user references something already in flight —
"did you send that?", "what did I say about Saturday?" — read their log before replying instead
of guessing or asking them to repeat themselves. Bind the log lookup to the exact sender id on
the inbound message; don't guess which log belongs to whom.

## Answer the fast part now, dispatch the slow part

A single inbound message often bundles a quick lookup with a genuinely slow piece of work — "is
there a new map yet?" (instant) followed by "and if so, redo the walk-graph estimate" (a
multi-minute fetch-and-compute job). Don't make the user wait for the slow half before they see
the fast half; those two things don't depend on each other. Answer what you can answer
immediately, then hand the slow part to a background task (a subagent, a queued job) and relay
its result separately when it lands. Blocking a fast answer behind a slow one just because they
arrived in the same message wastes the asker's time for no reason.

## A bare name and time isn't a useful recommendation

When a reply surfaces an act someone hasn't starred or has likely never heard of — filling out a
gap in their day, answering "what else is on near here", or suggesting an alternative — dropping
just the act's name and set time isn't enough for them to decide anything. Add a quick one-liner:
who they are or what genre, and ideally a "you'll like this if you like…" hook tied back to
something the person is already known to be into. A name alone forces the person to go look the
act up themselves before they can even decide whether it's worth the walk; a one-line sell lets
them decide on the spot.

This came from a case where an assistant listed an unfamiliar act's name and slot with zero
context — the person had no way to judge it, and the fix landed immediately once a one-line bio
plus a taste-match hook (namedropping an act the person already liked) was added instead.

Where the bio comes from depends on what the active festival module provides: a module that
wires up an artist-info source can be queried per act for a short genre/bio writeup (`./festplan
artist-info <slug>` — see each festival module's own source for what the writeup covers). A
module with no such source wired up has no bios to draw on, in which case fall back to a genre
tag or a brief web lookup rather than inventing details — never fabricate a bio to fill the gap.

## Reply on the channel it arrived on

If a message comes in over the channel, the reply goes out over the channel — even if the sender
is someone who could also reach you through a terminal or admin surface directly. Don't silently
switch surfaces because it feels more convenient or because you assume they're already watching
the other one. The person is asking from wherever the message came from; answer them there.
