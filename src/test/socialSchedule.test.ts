import { describe, expect, it } from "vitest";
import {
  nextSocialSlot,
  nextSocialSlots,
  slotKey,
} from "../../shared/social/schedule";

describe("social schedule", () => {
  const tuesdayMorning = new Date("2026-10-27T10:00:00.000Z");

  it("uses noon Casablanca time for Instagram", () => {
    const slot = nextSocialSlot("instagram", tuesdayMorning);
    expect(slot.toISOString()).toBe("2026-10-28T11:00:00.000Z");
  });

  it("uses the first free Pinterest slot and includes Sunday", () => {
    expect(nextSocialSlot("pinterest", tuesdayMorning).toISOString()).toBe(
      "2026-10-28T08:00:00.000Z",
    );

    const used = new Set([
      slotKey(new Date("2026-10-28T08:00:00.000Z")),
      slotKey(new Date("2026-10-28T11:00:00.000Z")),
      slotKey(new Date("2026-10-28T19:00:00.000Z")),
      slotKey(new Date("2026-10-30T08:00:00.000Z")),
      slotKey(new Date("2026-10-30T11:00:00.000Z")),
      slotKey(new Date("2026-10-30T19:00:00.000Z")),
    ]);
    expect(nextSocialSlot("pinterest", tuesdayMorning, used).toISOString()).toBe(
      "2026-11-01T08:00:00.000Z",
    );
  });

  it("returns a sequence of distinct slots", () => {
    const slots = nextSocialSlots("pinterest", 3, tuesdayMorning);
    expect(new Set(slots.map(slotKey)).size).toBe(3);
    expect(slots[0].toISOString()).toBe("2026-10-28T08:00:00.000Z");
    expect(slots[1].toISOString()).toBe("2026-10-28T11:00:00.000Z");
    expect(slots[2].toISOString()).toBe("2026-10-28T19:00:00.000Z");
  });
});
