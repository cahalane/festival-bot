# Instagram announcements — investigated, NOT feasible for this project

**Date:** 2026-07-24
**Decision:** No Instagram monitor. Do not re-attempt via a server-side private-API login.

We scoped, designed, and fully implemented an ATN Instagram announcements back-channel, then
abandoned it. This note records **why**, so a future session doesn't walk the same path from scratch.

- Design spec: `docs/superpowers/specs/2026-07-24-instagram-announcements-design.md`
- Implementation plan: `docs/superpowers/plans/2026-07-24-instagram-announcements.md`
- Implementation: branch `feat/instagram-announcements` (**not merged** — see end).

## What we wanted

A reliable way to read ATN's public Instagram (`alltogethernow.ie`) recent **posts + stories** from
the Pi, to surface festival disruption *ahead* of the Appmiral timetable (the Lambrini Girls
cancellation hit Instagram before the schedule updated). Instagram is ATN's only real social channel,
so — unlike PS, which had Bluesky's free public AT-Protocol API — there is no clean public feed to
mirror.

## What we tried (in order)

1. **`instagram-private-api` (TypeScript, burner login).** Built the whole feature: a reusable
   `AnnouncementsSource` adapter (posts + stories → the shared `Announcement` shape, session
   persisted/reused), ATN26 wiring, a silent `announce-tick` watch mirroring `schedule-tick`, a
   Monitor loop, and a relevance-classifier procedure. **All 239 tests pass.** But the live login
   fails: `IgLoginBadPasswordError` (HTTP 400) from this box, with **two** different burner passwords.
2. **Anonymous public endpoint** (`i.instagram.com/api/v1/users/web_profile_info`, no login):
   **HTTP 429 (rate-limited)** on the first request from this IP. Not a usable/reliable path.
3. **`instagrapi` (Python, better-maintained) spike.** Same burner creds → **identical `BadPassword`
   rejection.** instagrapi's own error message is the tell: *"This can also happen when Instagram
   rejects the proxy/IP, device fingerprint, or login context, even if the password is correct."*

## Why it isn't feasible

- **No free, supported public API.** Bluesky has one; Instagram does not.
- **The private-API login is rejected for a fresh burner from this box — independent of language.**
  A TS lib and a well-maintained Python lib fail *identically* with the same creds, so this is an
  **account/IP/device-fingerprint problem, not a tooling one.** Getting past it needs account
  "warming" via the phone app + a session transplant and/or a residential proxy — ongoing manual
  babysitting, which is exactly wrong for an unattended monitor. The library choice (and therefore
  the TS-only rule) was a red herring: Python does not help.
- **The only genuinely *maintained* alternatives are paid or bureaucratic:**
  - **Apify** — a paid third-party scraper (small ongoing cost; still a scraper IG can disrupt).
  - **Meta Graph API "Business Discovery"** — official + free + stable, but **posts-only** (no
    stories) and gated behind a labyrinthine setup (a Meta developer app + an IG Business/Creator
    account + a linked Facebook Page + a manual token-exchange/refresh dance). The Business Suite is
    opaque enough that the setup cost alone sank it.
- **The value didn't justify any of that.** The Appmiral `schedule-watch` already catches lineup
  changes; Instagram would only have been a *leading indicator* — a nice-to-have — for a hobby
  crew-planning bot. Effort/cost/reliability didn't clear the bar.

## If ever revisited

Start from a **login-free maintained source** (Apify or Meta Business Discovery), **not** a
private-API login from the server — that path is a dead end here. The architecture built on the
branch is acquisition-path-agnostic (the `AnnouncementsSource` seam, the tick, dedup, and classifier
all stay), so only the adapter internals would need swapping.

## Branch disposition

`feat/instagram-announcements` holds the complete, tested implementation (6 commits) but is **not
merged**. It also adds the `instagram-private-api` dependency, which we do **not** want on `master`.
Kept unmerged as a record / discarded per the operator's call (see session).

## Resolution (2026-07-24) — the official Appmiral path works

Chasing Instagram led straight to the better source: **the Appmiral Content API — which we already
authenticate against for the lineup — exposes the official channel directly.** Two endpoints (same
`x-protect` auth, no scraping, no login, no ban risk):

- **`/notifications`** — ATN's official push/news inbox (dated announcements). Live-verified: pulls
  the real "Less Than 1 Week to Go!" post.
- **`/pages`** — 129 CMS info pages (campsite/event times, drop-off, …); each carries `modified_at`,
  so edits are detectable by diffing.

Built on branch `feat/appmiral-news`: an `AnnouncementsSource` over `/notifications` (reusing the
`announce-tick` silent-watch + classifier machinery originally designed for IG), plus a new
`PagesSource` + `pages-tick` content-diff watch, both armed via `arm-schedule-watch`. This **replaces
the Instagram approach entirely** for the same goal, with far better reliability. So the IG dead-end
was worth documenting, but the delivered feature is the Appmiral one.
