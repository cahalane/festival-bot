import { describe, expect, test } from "vitest";
import { folderNames, placemarkXml, removePlacemarksIn, injectIntoFolder } from "./kml-augment.js";

/**
 * The operator exported our KML out of Google My Maps, reorganised it
 * (splitting Stages into Music and Experience) and sent it back to be
 * augmented with the real coordinates ATN published on 2026-07-29.
 *
 * These operate on the KML as TEXT rather than parsing and re-serialising. My
 * Maps writes its own StyleMap/normal/highlight scaffolding, and a round-trip
 * through a generic XML writer would quietly reformat or drop parts of it. Text
 * surgery keeps their file byte-identical everywhere we don't touch — which is
 * the whole point, since it is their map, not ours.
 */
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>ATN2026</name>
    <Style id="icon-1"><IconStyle></IconStyle></Style>
    <Folder>
      <name>Facilities</name>
      <Placemark>
        <name>Toilets (Main Arena north)</name>
        <styleUrl>#icon-1</styleUrl>
        <Point><coordinates>-7.36,52.29,0</coordinates></Point>
      </Placemark>
      <Placemark>
        <name>Medical (Main Arena)</name>
        <styleUrl>#icon-1</styleUrl>
        <Point><coordinates>-7.37,52.30,0</coordinates></Point>
      </Placemark>
    </Folder>
    <Folder>
      <name><![CDATA[Food & drink]]></name>
      <Placemark>
        <name>32. Wine Bar</name>
        <Point><coordinates>-7.361,52.291,0</coordinates></Point>
      </Placemark>
    </Folder>
  </Document>
</kml>`;

describe("folderNames", () => {
  test("lists folders, unwrapping CDATA", () => {
    expect(folderNames(SAMPLE)).toEqual(["Facilities", "Food & drink"]);
  });
});

describe("placemarkXml", () => {
  test("writes lng,lat order and escapes the name", () => {
    const x = placemarkXml({ name: "Fish & Chips", lat: 52.29, lng: -7.36, styleUrl: "#icon-1" });
    expect(x).toContain("<coordinates>-7.36,52.29,0</coordinates>");
    expect(x).toContain("Fish &amp; Chips");
  });

  test("includes a description when given", () => {
    const x = placemarkXml({ name: "A", lat: 1, lng: 2, description: "official" });
    expect(x).toContain("<description>official</description>");
  });
});

describe("removePlacemarksIn", () => {
  test("removes only matching placemarks inside the named folder", () => {
    const out = removePlacemarksIn(SAMPLE, "Facilities", (n) => n.startsWith("Toilets"));
    expect(out).not.toContain("Toilets (Main Arena north)");
    expect(out).toContain("Medical (Main Arena)");
  });

  test("leaves other folders untouched even on a name that would match there", () => {
    const out = removePlacemarksIn(SAMPLE, "Facilities", (n) => n.includes("Bar"));
    expect(out).toContain("32. Wine Bar"); // lives in Food & drink
  });

  test("returns the document unchanged when the folder is absent", () => {
    expect(removePlacemarksIn(SAMPLE, "Nope", () => true)).toBe(SAMPLE);
  });

  test("keeps the surrounding document intact", () => {
    const out = removePlacemarksIn(SAMPLE, "Facilities", () => true);
    expect(out).toContain('<Style id="icon-1">');
    expect(out).toContain("<name>ATN2026</name>");
    expect(out.match(/<Folder>/g)).toHaveLength(2);
  });
});

describe("injectIntoFolder", () => {
  const pm = placemarkXml({ name: "Water Station", lat: 52.3, lng: -7.38, styleUrl: "#icon-1" });

  test("adds the placemark inside the target folder", () => {
    const out = injectIntoFolder(SAMPLE, "Facilities", [pm]);
    const facilities = out.slice(out.indexOf("Facilities"), out.indexOf("Food &"));
    expect(facilities).toContain("Water Station");
  });

  test("does not add it to any other folder", () => {
    const out = injectIntoFolder(SAMPLE, "Facilities", [pm]);
    expect(out.match(/Water Station/g)).toHaveLength(1);
  });

  test("matches a folder whose name is wrapped in CDATA", () => {
    const out = injectIntoFolder(SAMPLE, "Food & drink", [pm]);
    expect(out.slice(out.indexOf("Food &"))).toContain("Water Station");
  });

  test("throws on an unknown folder rather than silently dropping the data", () => {
    // Silently losing 26 water stations because a folder was renamed is exactly
    // the failure that would go unnoticed until someone needed a tap.
    expect(() => injectIntoFolder(SAMPLE, "Missing", [pm])).toThrow(/folder/i);
  });

  test("preserves the document's styles and structure", () => {
    const out = injectIntoFolder(SAMPLE, "Facilities", [pm]);
    expect(out).toContain('<Style id="icon-1">');
    expect(out.match(/<Folder>/g)).toHaveLength(2);
    expect(out.trimEnd().endsWith("</kml>")).toBe(true);
  });
});
