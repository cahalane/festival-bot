import { describe, expect, test } from "vitest";
import {
  foreignEdit,
  diffMirror,
  plausibleEdit,
  parseRevisions,
  lastEditorIsUs,
  type PushState,
  type MirrorAct,
} from "./cf-guard.js";

/**
 * Don't clobber someone else's Clashfinder work.
 *
 * Operator, 2026-08-01, after our push destroyed a user's hand-entered Seanchoíche
 * sessions: "1. Check if last editor of the Clashfinder was us. 2. If not, pull
 * the diff. 3. If diff is plausible, ask me before reconciling. 4. Don't run the
 * push until I make a go/no go call."
 *
 * Clashfinder's read API exposes `lastEdit` but no editor name, so "was it us"
 * is answered by recording the lastEdit we saw immediately after our own push
 * and comparing. Anything else moved it since.
 */
const state = (lastEdit: string): PushState => ({
  event: "atn2026",
  lastEdit,
  pushedAt: "2026-08-01T09:41:00+01:00",
  actCount: 482,
});

describe("foreignEdit", () => {
  test("is false when the mirror still shows the edit we left", () => {
    expect(foreignEdit("2026-08-01 09:41", state("2026-08-01 09:41"))).toBe(false);
  });

  test("is true when someone has edited since our push", () => {
    expect(foreignEdit("2026-08-01 11:20", state("2026-08-01 09:41"))).toBe(true);
  });

  test("is true when we have never pushed and cannot prove ownership", () => {
    // No state = no evidence the mirror is ours. Assume someone else's until shown otherwise.
    expect(foreignEdit("2026-08-01 11:20", undefined)).toBe(true);
  });

  test("is true for a DIFFERENT event even if the timestamp matches", () => {
    const other = { ...state("2026-08-01 09:41"), event: "ps26" };
    expect(foreignEdit("2026-08-01 09:41", other, "atn2026")).toBe(true);
  });
});

const remote: MirrorAct[] = [
  { name: "Pulp", stage: "ATN Main Stage", start: "2026-07-31 22:45" },
  { name: "Seanchoíche: Love", stage: "Seanchoíche", start: "2026-08-02 12:00" },
];

describe("diffMirror", () => {
  test("reports an act a human added that we do not have", () => {
    const ours: MirrorAct[] = [remote[0]!];
    const d = diffMirror(remote, ours);
    expect(d.theirsOnly.map((a) => a.name)).toEqual(["Seanchoíche: Love"]);
    expect(d.oursOnly).toEqual([]);
  });

  test("reports an act we would add that the mirror lacks", () => {
    const ours: MirrorAct[] = [...remote, { name: "The Mary Wallopers", stage: "Heineken Garden", start: "2026-08-01 15:00" }];
    expect(diffMirror(remote, ours).oursOnly.map((a) => a.name)).toEqual(["The Mary Wallopers"]);
  });

  test("treats a retimed act as a change, not an add plus a remove", () => {
    const ours: MirrorAct[] = [{ ...remote[0]!, start: "2026-07-31 23:00" }, remote[1]!];
    const d = diffMirror(remote, ours);
    expect(d.retimed).toHaveLength(1);
    expect(d.oursOnly).toEqual([]);
    expect(d.theirsOnly).toEqual([]);
  });

  test("is empty when the two agree", () => {
    const d = diffMirror(remote, [...remote]);
    expect(d.theirsOnly).toEqual([]);
    expect(d.oursOnly).toEqual([]);
    expect(d.retimed).toEqual([]);
  });
});

describe("plausibleEdit", () => {
  test("a handful of added acts is a plausible human contribution", () => {
    expect(plausibleEdit({ theirsOnly: new Array(6).fill(remote[1]), oursOnly: [], retimed: [] })).toBe(true);
  });

  test("wholesale replacement is NOT plausible — that is a broken sync, not a person", () => {
    expect(plausibleEdit({ theirsOnly: new Array(400).fill(remote[1]), oursOnly: [], retimed: [] })).toBe(false);
  });

  test("no difference at all is not an edit to reconcile", () => {
    expect(plausibleEdit({ theirsOnly: [], oursOnly: [], retimed: [] })).toBe(false);
  });
});


/**
 * Pointed at the real source, 2026-08-01: clashfinder.com/l/<event> lists
 * every revision with its AUTHOR, which answers "was the last editor us?"
 * directly instead of inferring it from a timestamp we recorded ourselves.
 */
const REV_HTML = `
  <h3>Revisions</h3>
  <div>Rev 111</div><div>11 minutes ago</div><div>by <a>alex-cf</a></div><div>retry</div>
  <div>Rev 110</div><div>12 minutes ago</div><div>by <a>alex-cf</a></div><div>Seanchoiche restored</div>
  <div>Rev 109</div><div>1 hour ago</div><div>by <a>someone_else</a></div><div>added Seanchoiche times</div>
`;

describe("parseRevisions", () => {
  test("reads revision numbers and authors, newest first", () => {
    const revs = parseRevisions(REV_HTML);
    expect(revs[0]!.rev).toBe(111);
    expect(revs[0]!.by).toBe("alex-cf");
    expect(revs[2]!.by).toBe("someone_else");
  });

  test("returns empty on unparseable html rather than throwing", () => {
    expect(parseRevisions("<html>nothing here</html>")).toEqual([]);
  });
});

describe("lastEditorIsUs", () => {
  test("true when the newest revision is ours", () => {
    expect(lastEditorIsUs(parseRevisions(REV_HTML), "alex-cf")).toBe(true);
  });

  test("false when somebody else edited last", () => {
    const theirs = parseRevisions(`<div>Rev 5</div><div>now</div><div>by <a>stranger</a></div><div>x</div>`);
    expect(lastEditorIsUs(theirs, "alex-cf")).toBe(false);
  });

  test("false when there are no revisions to judge", () => {
    expect(lastEditorIsUs([], "alex-cf")).toBe(false);
  });

  test("is case-insensitive about the username", () => {
    expect(lastEditorIsUs(parseRevisions(REV_HTML), "ALEX-CF")).toBe(true);
  });
});

/**
 * The first cut keyed acts on name+stage alone, so an act playing TWICE on the
 * same stage (Paradise Cabaret, Fri and Sun) collapsed to one entry and the two
 * dates read as a retime. It reported a phantom edit on a mirror nobody had
 * touched.
 */
describe("diffMirror with repeat performances", () => {
  const twice: MirrorAct[] = [
    { name: "Paradise Cabaret", stage: "Ping Pong Disco", start: "2026-07-31 22:00" },
    { name: "Paradise Cabaret", stage: "Ping Pong Disco", start: "2026-08-02 22:00" },
  ];

  test("an act playing twice on one stage is not a retime", () => {
    const d = diffMirror(twice, [...twice]);
    expect(d.retimed).toEqual([]);
    expect(d.theirsOnly).toEqual([]);
    expect(d.oursOnly).toEqual([]);
  });

  test("still catches a genuine retime of a once-only act", () => {
    const a: MirrorAct[] = [{ name: "Pulp", stage: "ATN Main Stage", start: "2026-07-31 22:45" }];
    const b: MirrorAct[] = [{ name: "Pulp", stage: "ATN Main Stage", start: "2026-07-31 23:15" }];
    expect(diffMirror(a, b).retimed).toHaveLength(1);
  });

  test("catches one of two performances moving", () => {
    const moved = [twice[0]!, { ...twice[1]!, start: "2026-08-02 23:30" }];
    const d = diffMirror(twice, moved);
    expect(d.retimed).toHaveLength(1);
    expect(d.theirsOnly).toEqual([]);
  });
});
