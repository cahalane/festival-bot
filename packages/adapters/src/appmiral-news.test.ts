import { describe, expect, test } from "vitest";
import {
  mapNotifications,
  pageRefs,
  diffPages,
  fetchPage,
  renderPageBody,
  type AppmiralNotificationsResponse,
  type AppmiralPagesResponse,
} from "./appmiral-news.js";

const notifs: AppmiralNotificationsResponse = {
  data: [
    { id: 29391, show_inbox: true, title: "Less Than 1 Week to Go!", body: "Everything you need to know.", image: null, sent_time: "2026-07-24T03:00:41+00:00", deleted_at: null },
    { id: 29390, show_inbox: true, title: "Weather update", body: "", image: "https://media.appmiral.com/x.jpg", sent_time: "2026-07-20T10:00:00+00:00", deleted_at: null },
    { id: 29389, show_inbox: true, title: "Deleted one", body: "gone", image: null, sent_time: "2026-07-19T10:00:00+00:00", deleted_at: "2026-07-19T12:00:00+00:00" },
    { id: 29388, show_inbox: false, title: "Silent/hidden", body: "not in inbox", image: null, sent_time: "2026-07-18T10:00:00+00:00", deleted_at: null },
  ],
  _meta: { total_count: 4 },
};

describe("mapNotifications", () => {
  test("keeps inbox notifications (drops deleted + non-inbox), newest-first, maps fields", () => {
    const out = mapNotifications(notifs);
    expect(out.map((a) => a.id)).toEqual(["29391", "29390"]);
    expect(out[0]).toEqual({
      id: "29391",
      text: "Less Than 1 Week to Go!\nEverything you need to know.",
      createdAt: "2026-07-24T03:00:41+00:00",
    });
    expect(out[1]).toEqual({
      id: "29390",
      text: "Weather update",
      createdAt: "2026-07-20T10:00:00+00:00",
      imageUrl: "https://media.appmiral.com/x.jpg",
    });
  });
});

const pages: AppmiralPagesResponse = {
  data: [
    { id: 1, title: "Campsite times", modified_at: "2026-07-01T00:00:00+00:00" },
    { id: 2, title: "Drop off & taxi", modified_at: "2026-07-01T00:00:00+00:00" },
    { id: 3, title: "Phone charging", modified_at: "2026-07-01T00:00:00+00:00" },
  ],
  _meta: { total_count: 3 },
};

describe("pageRefs + diffPages", () => {
  test("pageRefs projects id/title/modifiedAt", () => {
    expect(pageRefs(pages)).toEqual([
      { id: "1", title: "Campsite times", modifiedAt: "2026-07-01T00:00:00+00:00" },
      { id: "2", title: "Drop off & taxi", modifiedAt: "2026-07-01T00:00:00+00:00" },
      { id: "3", title: "Phone charging", modifiedAt: "2026-07-01T00:00:00+00:00" },
    ]);
  });

  test("diffPages reports added / removed / changed by id+modifiedAt", () => {
    const prev = pageRefs(pages);
    const cur = pageRefs({
      data: [
        { id: 1, title: "Campsite times", modified_at: "2026-07-01T00:00:00+00:00" }, // unchanged
        { id: 2, title: "Drop off & taxi", modified_at: "2026-07-25T09:00:00+00:00" }, // changed
        { id: 4, title: "Water refill points", modified_at: "2026-07-25T09:00:00+00:00" }, // added
      ],
      _meta: { total_count: 3 },
    });
    const d = diffPages(prev, cur);
    expect(d.added.map((p) => p.id)).toEqual(["4"]);
    expect(d.removed.map((p) => p.id)).toEqual(["3"]);
    expect(d.changed.map((p) => p.id)).toEqual(["2"]);
  });
});

describe("renderPageBody", () => {
  test("strips tags, blocks become lines, entities decoded, blank runs squashed", () => {
    const html =
      '<p data-rte-preserve-empty="true">Showers open at</p>\r\n<p>7am - 2pm &amp; 4pm - 7pm.*</p>\r\n<p></p>\r\n<p>Toilets &lt;around&gt; site</p>';
    expect(renderPageBody(html)).toBe("Showers open at\n7am - 2pm & 4pm - 7pm.*\n\nToilets <around> site");
  });

  test("handles <br> and undefined", () => {
    expect(renderPageBody("line one<br/>line two")).toBe("line one\nline two");
    expect(renderPageBody(undefined)).toBe("");
  });
});

describe("fetchPage", () => {
  const pagesWithBody: AppmiralPagesResponse = {
    data: [
      { id: 457681, title: "Toilets & Showers", modified_at: "2026-07-24T15:45:01+00:00", body: "<p>Open 7am</p>" },
      { id: 99, title: "Other", modified_at: "2026-07-01T00:00:00+00:00", body: "<p>x</p>" },
    ],
  };

  test("returns the matching page with rendered body", async () => {
    const p = await fetchPage({ event: "e", edition: "ed", xProtect: "t" }, "457681", {
      fetchJson: <T>() => Promise.resolve(pagesWithBody as unknown as T),
    });
    expect(p).toEqual({
      id: "457681",
      title: "Toilets & Showers",
      modifiedAt: "2026-07-24T15:45:01+00:00",
      body: "Open 7am",
    });
  });

  test("returns null for an unknown id", async () => {
    const p = await fetchPage({ event: "e", edition: "ed", xProtect: "t" }, "does-not-exist", {
      fetchJson: <T>() => Promise.resolve(pagesWithBody as unknown as T),
    });
    expect(p).toBeNull();
  });
});
