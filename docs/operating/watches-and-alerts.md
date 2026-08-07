# Watches and alerts

This bot runs a handful of unattended background checks — a lineup-change watch, an
announcements watch, a weather/rain watch, an info-page watch. They exist so the crew hears about
something that matters without anyone having to ask. Getting the *contract* right (so nothing is
silently lost) and the *threshold* right (so people don't learn to ignore it) are both load-bearing.

## The watch contract

Every watch built for this bot follows the same shape, and any new one should too:

1. **Silent unless something changed.** A tick that finds nothing produces no output at all. An
   idle event should never generate noise just because the watch fired — the absence of a message
   is the expected, correct outcome most of the time.
2. **State lives on disk, not just in the session.** Each watch keeps its own baseline (a saved
   snapshot of the last-seen lineup, the last-seen notification id, the last-seen page
   modification timestamps) on disk, and only advances that baseline *after* successfully
   reporting a change. This matters because the process running the watch is not guaranteed to be
   alive continuously — sessions restart, hosts reboot. Because the comparison point survives a
   restart, a change that lands while nothing was watching still gets caught and still fires
   exactly once on the next tick that runs, instead of being silently missed or, worse, re-fired
   repeatedly.
3. **Fail quietly until the third consecutive failure.** A single failed fetch (a timeout, a
   transient 5xx) is not itself news — retry on the next tick. Only escalate to the operator once
   a source has failed three ticks in a row, which is the point where "the network blipped" stops
   being the likely explanation and "this source is actually down" starts being the likely one.
   This keeps a flaky-but-recovering source from generating an alert every few minutes while still
   catching a genuine outage promptly.

## Set thresholds by "would anyone act on this," not by what's measurable

A watch can usually measure far more granularity than anyone needs alerted on. The mistake is
wiring the alert threshold to whatever the underlying API happens to report, rather than to what
would actually change someone's plans.

**The drizzle story:** a rain-warning watch was built to flag any measurable precipitation in the
next few hours. Over one twelve-hour stretch it fired three separate times for the same
underlying weather — 0.1mm, then a dry hour, then 0.4mm again — because each dry hour in between
reset what counted as a new "episode" and the next trace of rain was treated as a fresh event
worth a fresh message. None of those three messages contained anything worth anyone changing
their plans over. That's not a case where more careful judgement on each individual firing would
have helped — the *bar itself* was wrong. A threshold that fires on 0.1mm splits ordinary weather
noise into repeated "events." Once a watch has cried wolf a few times, people stop reading it —
and a muted watch is functionally identical to no watch at all, because the one time it fires for
something real, it fires into a channel nobody is checking anymore. The fix was not "think harder
about each alert," it was raising the threshold to a level someone would actually act on, and
suppressing re-alerts for what is really the same ongoing episode.

The general form: before wiring up a new alert condition, ask what threshold would make someone
actually change behaviour (leave earlier, grab a jacket, reroute around a closed stage) — and set
the trigger there, not at "any detectable change at all."

## Verify a rendered output before sending it, don't trust exit-zero

If a watch or on-demand command produces a rendered artefact (an image card, a formatted summary)
built from a live fetch, a partial upstream failure can produce a technically-successful render
that is missing a whole section — the underlying process still exits cleanly and writes a file,
it's just an incomplete one. This is a silent-degradation failure mode, not a crash, so it will
not be caught by "did the command succeed." One recurring real case: an hourly weather feed
occasionally failed while the daily feed it's paired with succeeded, and the renderer correctly
refused to blend two different forecast runs — so it just dropped the hourly section rather than
producing a wrong one. The correct render and the degraded render differ only by a block of blank
space at the bottom. Reading that blank space as "huh, weird layout bug" instead of "the hourly
data is missing" is exactly the wrong diagnosis, and it's an easy one to make if you don't
actually open the output before sending it.

The rule that follows: before sending any rendered artefact produced by a live-data pipeline,
actually open and inspect it against a completeness checklist for that artefact (does every
expected section have real content, is there an unexplained empty region, are the expected
sub-elements present) — not just "did the generating command exit 0" and not just "does the file
exist." If it's incomplete, don't send it: retry once (transient upstream failures often clear
within minutes), and if it's still degraded, fall back to a plain-text summary and say plainly
that the rich version isn't available right now, rather than sending something that looks broken
or, worse, looks complete but silently isn't.

## When a watch fires on something real, act — don't just report and wait

For a genuine change (a lineup move that affects what a real starred pick means, an urgent
announcement), the right response to a watch firing is to *act*: push any downstream mirror this
bot maintains so the crew's shared source of truth is correct immediately, then work out who is
actually affected and tell them, in their own established tone. Don't report the change into a
log or a private channel and leave it there waiting for someone to ask. A change that only exists
in the assistant's own transcript is a change nobody has actually acted on yet.

This has a natural companion rule about *noise*, which lives with the mirror-maintenance discipline
in [`clashfinder.md`](clashfinder.md): acting promptly on a real change and not pestering people
over trivial ones are not in tension — the test for whether to message a person is "does what they
would actually catch change," not "did the underlying feed change at all." A rename with no time or
stage move, or an addition nobody has any interest in, doesn't warrant a message even though it is a
genuine diff. Bias to action is about not sitting on something real, not about broadcasting every
detected delta.
