/**
 * Shared plumbing for the PNG cards we send to Telegram.
 *
 * Extracted from the weather card once a second card (the route) needed the same
 * things: the chromium screenshot, HTML escaping, and one palette so the cards
 * look like they come from the same tool.
 *
 * The rule these cards are built on, learned the hard way on 2026-07-27: a card
 * renders ONLY what was computed from data. Interpretation — "that's a brutal
 * walk", "you're losing them either way" — belongs in the message sent alongside
 * it, where it is written fresh each time and can be per-person. Prose baked into
 * a template renders unattended long after it stopped being true.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Card width in CSS px. Fixed so every card crops identically in a chat client. */
export const CARD_WIDTH = 1000;

export const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Shared palette and type. Kept as a string of CSS custom properties rather than
 * a token object because the consumers are HTML template literals.
 */
export const CARD_TOKENS = `
  --ink:#151B18; --panel:#1B2320; --raise:#232D29; --line:#33413A;
  --text:#E8EDE9; --dim:#8B978F; --faint:#6E7A73;
  --accent:#D9A244; --cool:#4C93AC; --warn:#C4553F;
  --serif:Georgia,"DejaVu Serif",serif;
  --sans:"DejaVu Sans",system-ui,sans-serif;
  --mono:"DejaVu Sans Mono",ui-monospace,monospace;
`;

const CHROMIUM_CANDIDATES = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"];

/**
 * Screenshot a card to PNG via headless chromium. Deliberately shells out to a
 * browser already on the box rather than pulling in sharp/canvas/puppeteer: this
 * runs on a Pi, and the project has no image dependencies (nor wants any).
 *
 * `heightPx` matters: chromium screenshots a fixed window, so a height that does
 * not match the content gives either a clipped card or a band of dead space.
 */
export function writeCardPng(html: string, outFile: string, heightPx: number, widthPx = CARD_WIDTH): void {
  const dir = mkdtempSync(join(tmpdir(), "festplan-card-"));
  const page = join(dir, "card.html");
  writeFileSync(page, html);
  try {
    let lastErr: unknown = null;
    for (const bin of CHROMIUM_CANDIDATES) {
      try {
        execFileSync(
          bin,
          [
            "--headless",
            "--disable-gpu",
            "--no-sandbox",
            "--hide-scrollbars",
            "--force-device-scale-factor=2", // retina-ish, so it stays crisp zoomed in chat
            `--window-size=${Math.round(widthPx)},${Math.round(heightPx)}`,
            `--screenshot=${outFile}`,
            `file://${page}`,
          ],
          { stdio: "pipe", timeout: 60_000 },
        );
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(
      `could not render PNG — no working chromium found (tried ${CHROMIUM_CANDIDATES.join(", ")}): ${
        (lastErr as Error)?.message ?? "unknown"
      }`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
