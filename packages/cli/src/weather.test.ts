import { describe, expect, test } from "vitest";
import type { WeatherDaily } from "@festival-bot/core";
import {
  buildWeatherReport,
  labelForDate,
  nightLabel,
  renderWeatherReport,
  renderWeatherCardHtml,
  tempBarGeometry,
  cardHeightPx,
  dayHours,
  overnightRain,
  rainIntensityStep,
  skyStep,
  getawayDate,
  festivalDates,
  cardCommentary,
  shouldUseHourly,
} from "./weather.js";

const day = (
  date: string,
  tempMaxC: number,
  tempMinC: number,
  precipMm: number,
  precipProbPct: number,
): WeatherDaily => ({ date, tempMaxC, tempMinC, precipMm, precipProbPct });

// A stand-in for the real ATN26 window: Thu 30 Jul -> Sun 2 Aug 2026.
const FESTIVAL_DATES = ["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"];

describe("buildWeatherReport", () => {
  test("marks which forecast days fall inside the festival", () => {
    const report = buildWeatherReport(
      [day("2026-07-29", 21, 15, 0.3, 54), day("2026-07-30", 16.5, 11.2, 3.0, 27)],
      FESTIVAL_DATES,
    );

    expect(report.rows.map((r) => r.isFestivalDay)).toEqual([false, true]);
  });

  test("labels each row with weekday and date", () => {
    const report = buildWeatherReport([day("2026-07-30", 16.5, 11.2, 3.0, 27)], FESTIVAL_DATES);

    expect(report.rows[0]!.label).toBe("Thu 30 Jul");
  });

  test("names the wettest festival day", () => {
    const report = buildWeatherReport(
      [
        day("2026-07-30", 16.5, 11.2, 3.0, 27),
        day("2026-07-31", 19.9, 10.1, 0.3, 33),
        day("2026-08-01", 19.9, 10.0, 0.0, 22),
      ],
      FESTIVAL_DATES,
    );

    expect(report.wettest?.date).toBe("2026-07-30");
  });

  test("ignores non-festival days when picking the wettest", () => {
    const report = buildWeatherReport(
      [day("2026-07-28", 20, 14, 9.9, 90), day("2026-07-30", 16.5, 11.2, 3.0, 27)],
      FESTIVAL_DATES,
    );

    expect(report.wettest?.date).toBe("2026-07-30");
  });

  test("has no wettest day when the festival is entirely dry", () => {
    const report = buildWeatherReport([day("2026-07-30", 20, 12, 0, 10)], FESTIVAL_DATES);

    expect(report.wettest).toBeNull();
  });

  test("names the coldest festival night", () => {
    const report = buildWeatherReport(
      [day("2026-07-30", 16.5, 11.2, 3.0, 27), day("2026-08-01", 19.9, 10.0, 0.0, 22)],
      FESTIVAL_DATES,
    );

    expect(report.coldestNight?.date).toBe("2026-08-01");
  });

  test("reports no festival days when the forecast does not reach the festival", () => {
    const report = buildWeatherReport([day("2026-07-25", 21, 13, 0, 29)], FESTIVAL_DATES);

    expect(report.coversFestival).toBe(false);
    expect(report.wettest).toBeNull();
    expect(report.coldestNight).toBeNull();
  });
});

describe("festivalDates", () => {
  test("converts the manifest's [y, m, d] tuples to ISO dates", () => {
    expect(festivalDates({ thu: [2026, 7, 30], sun: [2026, 8, 2] })).toEqual([
      "2026-07-30",
      "2026-08-02",
    ]);
  });

  test("zero-pads single-digit months and days", () => {
    expect(festivalDates({ d: [2026, 1, 5] })).toEqual(["2026-01-05"]);
  });
});

describe("renderWeatherReport", () => {
  test("marks festival days with a bullet and leaves other days unmarked", () => {
    const report = buildWeatherReport(
      [day("2026-07-29", 21.1, 15.6, 0.3, 54), day("2026-07-30", 16.5, 11.2, 3.0, 27)],
      FESTIVAL_DATES,
    );

    const out = renderWeatherReport(report, "All Together Now 2026");

    expect(out).toContain("* Thu 30 Jul");
    expect(out).toContain("  Wed 29 Jul");
  });

  test("shows temperature range, rain and probability for a day", () => {
    const report = buildWeatherReport([day("2026-07-30", 16.5, 11.2, 3.0, 27)], FESTIVAL_DATES);

    const out = renderWeatherReport(report, "All Together Now 2026");

    expect(out).toContain("16.5");
    expect(out).toContain("11.2");
    expect(out).toContain("3.0 mm");
    expect(out).toContain("27%");
  });

  test("calls out the wettest festival day and coldest night", () => {
    const report = buildWeatherReport(
      [day("2026-07-30", 16.5, 11.2, 3.0, 27), day("2026-08-01", 19.9, 10.0, 0.0, 22)],
      FESTIVAL_DATES,
    );

    const out = renderWeatherReport(report, "All Together Now 2026");

    expect(out).toContain("wettest");
    expect(out).toContain("Thu 30 Jul");
    expect(out).toContain("coldest night");
  });

  test("warns loudly when the data came from a stale cache", () => {
    const report = buildWeatherReport([day("2026-07-30", 16.5, 11.2, 3.0, 27)], FESTIVAL_DATES);

    const out = renderWeatherReport(report, "All Together Now 2026", { stale: true });

    expect(out).toContain("STALE");
  });

  test("does not mention staleness on a fresh fetch", () => {
    const report = buildWeatherReport([day("2026-07-30", 16.5, 11.2, 3.0, 27)], FESTIVAL_DATES);

    const out = renderWeatherReport(report, "All Together Now 2026", { stale: false });

    expect(out).not.toContain("STALE");
  });

  test("warns when the forecast does not yet reach the festival", () => {
    const report = buildWeatherReport([day("2026-07-25", 21, 13, 0, 29)], FESTIVAL_DATES);

    const out = renderWeatherReport(report, "All Together Now 2026");

    expect(out).toContain("forecast does not reach");
  });
});

describe("tempBarGeometry", () => {
  // The card plots every day on ONE shared axis so colder nights visibly reach
  // further left. If each bar were scaled to its own range that signal is lost.
  test("places a day's low and high as percentages of the shared axis", () => {
    const g = tempBarGeometry({ tempMinC: 8, tempMaxC: 24 }, { min: 8, max: 24 });
    expect(g.leftPct).toBeCloseTo(0);
    expect(g.widthPct).toBeCloseTo(100);
  });

  test("a colder night sits further left than a milder one on the same axis", () => {
    const axis = { min: 8, max: 24 };
    const cold = tempBarGeometry({ tempMinC: 8.5, tempMaxC: 19.1 }, axis);
    const mild = tempBarGeometry({ tempMinC: 12.9, tempMaxC: 19.7 }, axis);
    expect(cold.leftPct).toBeLessThan(mild.leftPct);
  });

  test("clamps a day that runs past the axis instead of overflowing the card", () => {
    const g = tempBarGeometry({ tempMinC: 2, tempMaxC: 40 }, { min: 8, max: 24 });
    expect(g.leftPct).toBe(0);
    expect(g.leftPct + g.widthPct).toBeLessThanOrEqual(100);
  });
});

describe("renderWeatherCardHtml", () => {
  const report = buildWeatherReport(
    [
      day("2026-07-29", 20.9, 14.4, 4.9, 57),
      day("2026-07-30", 19.7, 12.9, 2.3, 39),
      day("2026-08-01", 19.1, 8.5, 0, 22),
    ],
    FESTIVAL_DATES,
  );

  test("shows only the festival days, not the run-up", () => {
    // Assert on the day ROWS, not on callout prose: this used to lean on the
    // coldest-night sentence containing "Sat 1 Aug", so rewording that callout
    // broke a test about which days are shown.
    const html = renderWeatherCardHtml(report, "All Together Now 2026");
    const rowLabels = [...html.matchAll(/<div class="name">([^<]*)<span>([^<]*)<\/span>/g)].map(
      (m) => `${m[1]!.trim()} ${m[2]!.trim()}`,
    );
    expect(rowLabels).toContain("Thu 30 Jul");
    expect(rowLabels).toContain("Sat 1 Aug");
    expect(rowLabels.some((l) => l.startsWith("Wed 29"))).toBe(false);
  });

  test("leads with the coldest night, the fact that drives packing", () => {
    const html = renderWeatherCardHtml(report, "All Together Now 2026");
    expect(html).toContain("8.5");
  });

  test("renders a dry day as 'dry' rather than a misleading 0.0 mm", () => {
    const html = renderWeatherCardHtml(report, "All Together Now 2026");
    expect(html).toContain("dry");
  });

  test("carries the forecast-only caveat into the image itself", () => {
    const html = renderWeatherCardHtml(report, "All Together Now 2026");
    expect(html.toLowerCase()).toContain("forecast");
  });

  test("escapes the festival name rather than injecting raw markup", () => {
    const html = renderWeatherCardHtml(report, 'Fest <script>alert("x")</script>');
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("cardHeightPx", () => {
  // The PNG window is a fixed box, so the height must track the day count or the
  // image ends up with dead space below the content (or clips it).
  test("grows with each extra festival day", () => {
    expect(cardHeightPx(4)).toBeGreaterThan(cardHeightPx(3));
  });

  test("adds the same amount per day", () => {
    expect(cardHeightPx(4) - cardHeightPx(3)).toBe(cardHeightPx(3) - cardHeightPx(2));
  });
});

describe("dayHours", () => {
  const h = (date: string, hour: number, prob: number, mm = 0) => ({
    time: `${date}T${String(hour).padStart(2, "0")}:00`,
    tempC: 15,
    precipMm: mm,
    precipProbPct: prob,
  });

  test("keeps the whole 24 hours — a camping festival is occupied overnight", () => {
    const hours = dayHours([h("2026-07-30", 3, 90, 0.3), h("2026-07-30", 14, 20)], "2026-07-30");
    expect(hours.map((x) => x.hour)).toEqual([3, 14]);
  });

  test("excludes other dates", () => {
    expect(dayHours([h("2026-07-30", 14, 20), h("2026-07-31", 14, 80)], "2026-07-30")).toHaveLength(1);
  });

  test("marks small hours as night, afternoon as not", () => {
    const hours = dayHours([h("2026-07-30", 3, 10), h("2026-07-30", 15, 10)], "2026-07-30");
    expect(hours.find((x) => x.hour === 3)!.isNight).toBe(true);
    expect(hours.find((x) => x.hour === 15)!.isNight).toBe(false);
  });
});

describe("overnightRain", () => {
  const h = (date: string, hour: number, mm: number) => ({
    time: `${date}T${String(hour).padStart(2, "0")}:00`,
    tempC: 11,
    precipMm: mm,
    precipProbPct: 20,
  });

  test("spans the night across midnight into the next morning", () => {
    // Tents get rained on from 23:00 through to breakfast, not 00:00-23:59.
    const hourly = [h("2026-07-31", 23, 0.4), h("2026-08-01", 2, 0.5), h("2026-08-01", 7, 0.1)];
    expect(overnightRain(hourly, "2026-07-31").mm).toBeCloseTo(1.0);
  });

  test("ignores daytime rain on either side of the night", () => {
    const hourly = [h("2026-07-31", 14, 5.0), h("2026-08-01", 15, 5.0), h("2026-08-01", 3, 0.2)];
    expect(overnightRain(hourly, "2026-07-31").mm).toBeCloseTo(0.2);
  });

  test("reports a dry night as zero", () => {
    expect(overnightRain([h("2026-08-01", 3, 0)], "2026-07-31").mm).toBe(0);
  });
});

describe("renderWeatherCardHtml with hourly detail", () => {
  const report = buildWeatherReport([day("2026-07-30", 19.7, 12.9, 2.3, 39)], FESTIVAL_DATES);
  const hourly = Array.from({ length: 24 }, (_, i) => ({
    time: `2026-07-30T${String(i).padStart(2, "0")}:00`,
    tempC: i < 8 ? 12 : 18,
    precipMm: i < 8 ? 0.3 : 0,
    precipProbPct: i < 8 ? 15 : 30,
  }));

  test("draws a full 24-hour strip, including the overnight hours", () => {
    const html = renderWeatherCardHtml(report, "ATN", { hourly });
    expect(html).toContain('class="hours"');
    expect((html.match(/class="hr/g) ?? []).length).toBe(24);
  });

  test("omits the hour strip entirely when no hourly data is supplied", () => {
    const html = renderWeatherCardHtml(report, "ATN");
    expect(html).not.toContain('class="hours"');
  });

  test("keeps the honest full-day rain total rather than a daytime-only one", () => {
    const html = renderWeatherCardHtml(report, "ATN", { hourly });
    expect(html).toContain("2.4 mm");
  });
});

describe("rainIntensityStep", () => {
  // Discrete steps, Forecaster-style: a continuous gradient is unreadable at
  // 24-bars-wide and impossible to write a legend for.
  test("no measurable rain is step 0", () => {
    expect(rainIntensityStep(0)).toBe(0);
  });

  test("steps up as the hourly volume grows", () => {
    const steps = [0.05, 0.3, 0.8, 2.5].map(rainIntensityStep);
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(new Set(steps).size).toBe(4);
  });

  test("clamps heavy rain to the top step rather than running off the scale", () => {
    expect(rainIntensityStep(50)).toBe(rainIntensityStep(4));
  });

  test("any measurable rain is distinguishable from none", () => {
    expect(rainIntensityStep(0.05)).toBeGreaterThan(rainIntensityStep(0));
  });
});

describe("card legend", () => {
  const report = buildWeatherReport([day("2026-07-30", 19.7, 12.9, 2.3, 39)], FESTIVAL_DATES);
  const hourly = Array.from({ length: 24 }, (_, i) => ({
    time: `2026-07-30T${String(i).padStart(2, "0")}:00`,
    tempC: 15,
    precipMm: i < 8 ? 0.3 : 0,
    precipProbPct: i < 8 ? 15 : 30,
  }));

  test("explains both encodings when the strip is shown", () => {
    const html = renderWeatherCardHtml(report, "ATN", { hourly });
    expect(html).toContain("class=\"legend\"");
    expect(html.toLowerCase()).toContain("height");
    expect(html.toLowerCase()).toContain("colour");
  });

  test("colours each bar by its own hourly conditions", () => {
    const html = renderWeatherCardHtml(report, "ATN", { hourly });
    // This fixture carries no cloud data, so dry hours must fall back to "cloudy"
    // rather than being painted as sunshine we cannot vouch for.
    expect(html).toContain("hr cloudy");
    expect(html).toMatch(/hr r[1-4]/); // the wet overnight hours
    expect(html).not.toContain("hr clear");
  });

  test("shows no legend when there is no strip to explain", () => {
    expect(renderWeatherCardHtml(report, "ATN")).not.toContain("class=\"legend\"");
  });
});

describe("skyStep", () => {
  // Forecaster's model: ONE scale where rain outranks cloud, and cloud splits at
  // 25%/75% cover — the same thresholds its colour guide uses.
  test("any measurable rain outranks whatever the cloud is doing", () => {
    expect(skyStep(0.5, 0)).toBe("r3");
    expect(skyStep(2, 100)).toBe("r4");
  });

  test("clear is a nearly cloudless, dry hour", () => {
    expect(skyStep(0, 0)).toBe("clear");
    expect(skyStep(0, 16)).toBe("clear");
  });

  test("partly cloudy spans a quarter to three quarters cover", () => {
    expect(skyStep(0, 35)).toBe("partly");
    expect(skyStep(0, 60)).toBe("partly");
  });

  test("heavy cloud is over three quarters cover", () => {
    expect(skyStep(0, 78)).toBe("cloudy");
    expect(skyStep(0, 100)).toBe("cloudy");
  });

  test("treats missing cloud data as unknown rather than inventing sunshine", () => {
    expect(skyStep(0, undefined)).toBe("cloudy");
  });
});

describe("card sky colouring", () => {
  const report = buildWeatherReport([day("2026-07-31", 18.2, 9.2, 0, 41)], FESTIVAL_DATES);
  const hourly = [
    { time: "2026-07-31T09:00", tempC: 14, precipMm: 0, precipProbPct: 5, cloudCoverPct: 7 },
    { time: "2026-07-31T12:00", tempC: 17, precipMm: 0, precipProbPct: 20, cloudCoverPct: 60 },
    { time: "2026-07-31T15:00", tempC: 18, precipMm: 0, precipProbPct: 41, cloudCoverPct: 87 },
    { time: "2026-07-31T18:00", tempC: 17, precipMm: 0.6, precipProbPct: 30, cloudCoverPct: 90 },
  ];

  test("paints clear, partly cloudy, cloudy and wet hours differently", () => {
    const html = renderWeatherCardHtml(report, "ATN", { hourly });
    for (const cls of ["hr clear", "hr partly", "hr cloudy", "hr r3"]) {
      expect(html).toContain(cls);
    }
  });

  test("legend names the sky conditions, not just the rain bands", () => {
    const html = renderWeatherCardHtml(report, "ATN", { hourly });
    expect(html.toLowerCase()).toContain("clear");
    expect(html.toLowerCase()).toContain("cloud");
  });
});

describe("getaway morning", () => {
  // A user asked for Monday morning (2026-07-26). Right instinct for a camping
  // festival: the crew are still on site striking tents the morning AFTER the last
  // act, so that half-day is part of the weather they actually stand in.
  test("is the day after the last festival day", () => {
    expect(getawayDate(FESTIVAL_DATES)).toBe("2026-08-03");
  });

  test("handles a festival ending at a month boundary", () => {
    expect(getawayDate(["2026-01-30", "2026-01-31"])).toBe("2026-02-01");
  });

  test("is null when there are no festival dates", () => {
    expect(getawayDate([])).toBeNull();
  });

  test("report exposes the getaway row when the forecast reaches it", () => {
    const report = buildWeatherReport(
      [day("2026-08-02", 19.4, 11.7, 0.6, 17), day("2026-08-03", 21.8, 12.4, 0, 29)],
      FESTIVAL_DATES,
    );
    expect(report.getaway?.date).toBe("2026-08-03");
    expect(report.getaway?.isFestivalDay).toBe(false);
  });

  test("report has no getaway row when the forecast stops at the festival", () => {
    const report = buildWeatherReport([day("2026-08-02", 19.4, 11.7, 0.6, 17)], FESTIVAL_DATES);
    expect(report.getaway).toBeNull();
  });
});

describe("renderWeatherCardHtml getaway row", () => {
  const rows = [
    day("2026-07-30", 19.7, 12.9, 2.3, 39),
    day("2026-08-03", 21.8, 12.4, 0, 29),
  ];
  const hourly = Array.from({ length: 48 }, (_, i) => ({
    time: `2026-08-0${i < 24 ? "2" : "3"}T${String(i % 24).padStart(2, "0")}:00`,
    tempC: 15,
    precipMm: 0,
    precipProbPct: 10,
    cloudCoverPct: 50,
  }));

  test("labels the getaway row as the pack-up morning", () => {
    const html = renderWeatherCardHtml(buildWeatherReport(rows, FESTIVAL_DATES), "ATN", { hourly });
    expect(html.toLowerCase()).toContain("pack-up");
  });

  test("shows only the morning hours for the getaway day", () => {
    const html = renderWeatherCardHtml(buildWeatherReport(rows, FESTIVAL_DATES), "ATN", { hourly });
    const row = html.slice(html.indexOf("getaway"));
    // 00:00-12:00 inclusive = 13 bars, not a full 24.
    expect((row.match(/class="hr /g) ?? []).length).toBe(13);
  });
});

describe("cardCommentary", () => {
  // The card's headline and standfirst were HARDCODED prose ("Four days, and the
  // cold comes at night" / "Mild and mostly dry through the weekend"). That text
  // was written by hand for one particular forecast and then went out unattended
  // every day afterwards, so it would keep asserting a mild, dry, cold-at-night
  // weekend straight through a heatwave or a washout. Derive it instead.
  const dry = () =>
    buildWeatherReport(
      [
        day("2026-07-30", 19.6, 9.3, 0, 23),
        day("2026-07-31", 19.3, 7.8, 0, 24),
        day("2026-08-01", 17.6, 8.3, 0, 24),
        day("2026-08-02", 20.4, 13.3, 0, 32),
      ],
      FESTIVAL_DATES,
    );

  test("names the number of festival days it actually covers", () => {
    expect(cardCommentary(dry()).headline).toContain("Four days");
  });

  test("leads on rain when festival days are wet", () => {
    const report = buildWeatherReport(
      [
        day("2026-07-30", 19.6, 9.3, 0, 23),
        day("2026-07-31", 19.3, 7.8, 0, 24),
        day("2026-08-01", 17.6, 8.3, 1.2, 24),
        day("2026-08-02", 20.4, 13.3, 7.9, 32),
      ],
      FESTIVAL_DATES,
    );

    expect(cardCommentary(report).headline).toMatch(/rain/i);
    expect(cardCommentary(report).standfirst).toContain("Sun 2 Aug");
  });

  test("leads on the night/day spread when it is dry but cold after dark", () => {
    const c = cardCommentary(dry());
    expect(c.headline).toMatch(/night/i);
    // A dry forecast must never be described as wet.
    expect(c.standfirst).toMatch(/no measurable rain/i);
  });

  test("does not claim a warm night when the forecast is cold", () => {
    const warm = buildWeatherReport(
      [
        day("2026-07-30", 26, 18, 0, 5),
        day("2026-07-31", 27, 19, 0, 5),
        day("2026-08-01", 28, 19.5, 0, 5),
        day("2026-08-02", 27, 18.5, 0, 5),
      ],
      FESTIVAL_DATES,
    );

    expect(cardCommentary(warm).headline).not.toMatch(/cold/i);
    // The lowest overnight low across those four days is 18.0, not the 19s.
    expect(cardCommentary(warm).standfirst).toContain("18.0");
  });

  test("says so plainly when the forecast has not reached the festival", () => {
    const early = buildWeatherReport([day("2026-07-01", 20, 12, 0, 10)], FESTIVAL_DATES);
    expect(cardCommentary(early).headline).toMatch(/not|yet/i);
  });

  test("quotes the real highs and lows rather than a fixed spread", () => {
    expect(cardCommentary(dry()).standfirst).toContain("7.8");
  });
});

describe("card prose makes no claim the data cannot support", () => {
  // The coldest-night note asserted the figure "has moved consistently colder on
  // every run" — the renderer keeps no history of previous runs, so this was a
  // trend claim invented from nothing and repeated daily. It must not come back.
  test("never claims a run-over-run trend", () => {
    const report = buildWeatherReport(
      [day("2026-07-30", 19.6, 9.3, 0, 23), day("2026-07-31", 19.3, 7.8, 0, 24)],
      FESTIVAL_DATES,
    );
    const html = renderWeatherCardHtml(report, "All Together Now 2026");

    expect(html).not.toMatch(/every run/i);
    expect(html).not.toMatch(/moved consistently/i);
  });

  test("does not pin the overnight low to a clock time it never computed", () => {
    const report = buildWeatherReport(
      [day("2026-07-30", 19.6, 9.3, 0, 23), day("2026-07-31", 19.3, 7.8, 0, 24)],
      FESTIVAL_DATES,
    );
    expect(renderWeatherCardHtml(report, "All Together Now 2026")).not.toMatch(/3am/i);
  });
});

describe("cardCommentary agrees with the rest of the card", () => {
  // The card already had one rule: every rainfall figure on it comes from the same
  // measure, because the daily endpoint's total and the hourly sum genuinely
  // disagree. The derived standfirst has to obey that rule too, or the headline
  // quotes one number while the callout beneath it quotes another for the same day.
  test("quotes rainfall through the supplied measure, not the daily total", () => {
    const report = buildWeatherReport(
      [
        day("2026-07-30", 19.6, 9.3, 0, 23),
        day("2026-08-02", 20.4, 13.3, 7.9, 32),
      ],
      FESTIVAL_DATES,
    );

    const c = cardCommentary(report, (r) => (r.date === "2026-08-02" ? 10.0 : 0));

    expect(c.standfirst).toContain("10.0mm");
    expect(c.standfirst).not.toContain("7.9mm");
  });

  test("counts wet days by the supplied measure", () => {
    const report = buildWeatherReport(
      [
        day("2026-07-30", 19.6, 9.3, 0, 23),
        day("2026-07-31", 19.3, 7.8, 0, 24),
        day("2026-08-01", 17.6, 8.3, 0, 24),
        day("2026-08-02", 20.4, 13.3, 0, 32),
      ],
      FESTIVAL_DATES,
    );

    // Daily says bone dry; the hourly series says two of them carry real rain.
    const c = cardCommentary(report, (r) =>
      r.date === "2026-08-01" || r.date === "2026-08-02" ? 4 : 0,
    );

    expect(c.headline).toMatch(/rain on two of them/i);
  });

  test("the rendered card quotes one rainfall figure per day", () => {
    const report = buildWeatherReport(
      [day("2026-08-02", 20.4, 13.3, 7.9, 32)],
      FESTIVAL_DATES,
    );
    const html = renderWeatherCardHtml(report, "All Together Now 2026");

    // With no hourly series both surfaces fall back to the daily total, so the
    // standfirst and the callout must show the same number.
    expect(html.match(/7\.9\s?mm/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain("10.0 mm");
  });
});

describe("never blend two forecast runs into one card", () => {
  // 2026-07-28: the hourly fetch 503'd, fell back to a 24-hour-old cache, and the
  // card rendered TODAY's temperatures against YESTERDAY's rain — headline "rain
  // on two of them, Sun 2 Aug 10.0mm" on a day the fresh daily data called dry.
  // `stale` was read straight after daily() and before hourlyRange(), so the
  // warning never fired either. A card that mixes runs is worse than a stale one:
  // it is internally inconsistent and looks authoritative.
  test("drops the hourly detail when it is stale but the daily data is fresh", () => {
    expect(shouldUseHourly({ dailyStale: false, hourlyStale: true })).toBe(false);
  });

  test("keeps the hourly detail when both came from the same fresh fetch", () => {
    expect(shouldUseHourly({ dailyStale: false, hourlyStale: false })).toBe(true);
  });

  test("keeps it when BOTH are stale — consistent, and flagged as stale overall", () => {
    expect(shouldUseHourly({ dailyStale: true, hourlyStale: true })).toBe(true);
  });

  test("drops it when the daily is stale but the hourly is fresh", () => {
    // The reverse mix is equally incoherent.
    expect(shouldUseHourly({ dailyStale: true, hourlyStale: false })).toBe(false);
  });
});

/**
 * Naming the coldest night.
 *
 * Operator note, 2026-07-31: "is 5.5°C overnight tonight or tomorrow night? i.e. is that
 * a Saturday morning or night temperature?" — a fair question, because the card
 * said "COLDEST NIGHT — Sat 1 Aug" and meant 06:00 ON Saturday, i.e. the FRIDAY
 * night. The daily minimum lands at dawn, so labelling it with its calendar date
 * points readers at the wrong night entirely. Saturday evening was 13.7C, eight
 * degrees warmer than the number they were being told to pack for.
 */
describe("nightLabel", () => {
  test("names the night a dawn minimum actually belongs to", () => {
    expect(nightLabel("2026-08-01")).toBe("Fri 31 Jul night");
  });

  test("rolls back across a month boundary", () => {
    expect(nightLabel("2026-08-01")).toContain("Jul");
  });

  test("is distinct from the calendar-day label it replaces", () => {
    expect(nightLabel("2026-08-01")).not.toBe(labelForDate("2026-08-01"));
  });

  test("reads as a night, so it cannot be mistaken for a daytime figure", () => {
    expect(nightLabel("2026-08-02")).toBe("Sat 1 Aug night");
  });
});

/**
 * The coldest-night callout must look FORWARD.
 *
 * Sat 1 Aug's 09:00 card told the crew "coldest night: Fri 31 Jul night" — a
 * night they had already slept through. It picked the minimum across every
 * festival row including past ones, so the number to "pack a sleeping bag
 * against" was one they had already survived, while tonight's real low went
 * unmentioned. A forecast card is advice about what is coming.
 */
describe("buildWeatherReport coldest night looks forward", () => {
  const daily: WeatherDaily[] = [
    { date: "2026-07-31", tempMaxC: 18, tempMinC: 5.5, precipMm: 0, precipProbPct: 10 },
    { date: "2026-08-01", tempMaxC: 18, tempMinC: 10.2, precipMm: 0, precipProbPct: 14 },
    { date: "2026-08-02", tempMaxC: 19, tempMinC: 10.5, precipMm: 1.3, precipProbPct: 31 },
  ];
  const fest = ["2026-07-31", "2026-08-01", "2026-08-02"];

  test("ignores nights already past, INCLUDING tonight-just-gone", () => {
    // A row's minimum lands at ITS dawn, which belongs to the PREVIOUS night.
    // So on Sat 1 Aug, the 1 Aug row describes Friday night — already slept
    // through. The next night ahead is the 2 Aug row (Saturday night).
    const r = buildWeatherReport(daily, fest, { today: "2026-08-01" });
    expect(r.coldestNight?.date).toBe("2026-08-02");
  });

  test("still picks the genuine minimum among the nights ahead", () => {
    const warmer: WeatherDaily[] = [
      { date: "2026-08-01", tempMaxC: 18, tempMinC: 12, precipMm: 0, precipProbPct: 14 },
      { date: "2026-08-02", tempMaxC: 19, tempMinC: 8, precipMm: 0, precipProbPct: 31 },
    ];
    const r = buildWeatherReport(warmer, ["2026-08-01", "2026-08-02"], { today: "2026-07-31" });
    expect(r.coldestNight?.date).toBe("2026-08-02");
  });

  test("uses every festival night when no today is supplied", () => {
    // Pre-festival the whole window is ahead, so behaviour is unchanged.
    expect(buildWeatherReport(daily, fest).coldestNight?.date).toBe("2026-07-31");
  });

  test("falls back to the last night rather than null on the final day", () => {
    const r = buildWeatherReport(daily, fest, { today: "2026-08-02" });
    expect(r.coldestNight?.date).toBe("2026-08-02");
  });
});

/**
 * Grammar on the last day.
 *
 * Sunday's card led with "One days, one of them wet" — the headline templates
 * all assume a plural, and by the final morning there is exactly one festival
 * day left. It is the first line on the card.
 */
describe("cardCommentary with a single day left", () => {
  const oneDay: WeatherDaily[] = [
    { date: "2026-08-02", tempMaxC: 18.5, tempMinC: 10.1, precipMm: 2.1, precipProbPct: 45 },
  ];

  test("says day, not days, when only one is left", () => {
    const r = buildWeatherReport(oneDay, ["2026-08-02"]);
    expect(cardCommentary(r, (x) => x.precipMm).headline).not.toMatch(/One days/);
  });

  test("still describes it as wet when it is", () => {
    const r = buildWeatherReport(oneDay, ["2026-08-02"]);
    expect(cardCommentary(r, (x) => x.precipMm).headline.toLowerCase()).toMatch(/wet/);
  });

  test("keeps the plural for a normal multi-day card", () => {
    const three: WeatherDaily[] = [
      { date: "2026-07-31", tempMaxC: 18, tempMinC: 9, precipMm: 0, precipProbPct: 10 },
      { date: "2026-08-01", tempMaxC: 19, tempMinC: 10, precipMm: 0, precipProbPct: 14 },
      { date: "2026-08-02", tempMaxC: 19, tempMinC: 11, precipMm: 2.1, precipProbPct: 45 },
    ];
    const r = buildWeatherReport(three, three.map((d) => d.date));
    expect(cardCommentary(r, (x) => x.precipMm).headline).toMatch(/days/);
  });
});

/**
 * The coldest night on the FINAL day.
 *
 * Sunday's card said "coldest night: Sat 1 Aug night" — the night already
 * slept through. Filtering festival rows to those after today leaves nothing on
 * the last day, so it fell back to the last row, whose dawn belongs to
 * yesterday. But tonight IS in the forecast: it is the pack-up morning's dawn.
 */
describe("coldest night includes the pack-up morning", () => {
  const daily: WeatherDaily[] = [
    { date: "2026-08-01", tempMaxC: 19, tempMinC: 10.1, precipMm: 0, precipProbPct: 14 },
    { date: "2026-08-02", tempMaxC: 18.5, tempMinC: 10.1, precipMm: 2.1, precipProbPct: 45 },
    { date: "2026-08-03", tempMaxC: 20, tempMinC: 12.6, precipMm: 15.5, precipProbPct: 92 },
  ];
  const fest = ["2026-08-01", "2026-08-02"];

  test("names tonight, not the night already gone", () => {
    const r = buildWeatherReport(daily, fest, { today: "2026-08-02" });
    expect(nightLabel(r.coldestNight!.date)).toBe("Sun 2 Aug night");
  });

  test("still prefers a genuinely colder festival night when one is ahead", () => {
    const r = buildWeatherReport(daily, fest, { today: "2026-08-01" });
    expect(r.coldestNight?.date).toBe("2026-08-02");
  });
});
