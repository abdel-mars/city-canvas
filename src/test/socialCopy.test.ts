import { describe, expect, it } from "vitest";
import { instagramCopy, pinterestCopy } from "../../shared/social/copy";

describe("Pinterest copy", () => {
  it("renders the configured title, description, alt text and hashtags", () => {
    const copy = pinterestCopy({ cityName: "Casablanca" });
    expect(copy.title).toBe(
      "Casablanca Line Art Print — Minimalist Casablanca Wall Art",
    );
    expect(copy.description).toContain(
      "Bring the character of Casablanca into your space",
    );
    expect(copy.description).toContain(
      "Shop City Lines: https://citylinesart-shop.fourthwall.com/",
    );
    expect(copy.description).toContain("Casablanca wall art");
    expect(copy.hashtags).toContain("#Casablanca");
    expect(copy.altText).toBe(
      "Minimalist line art illustration inspired by the architecture of Casablanca, created by City Lines.",
    );
  });

  it("keeps the title and description inside the platform limits", () => {
    const copy = pinterestCopy({
      cityName: "Llanfairpwllgwyngyllgogerychwyrndrobwllllantysiliogogogoch",
    });
    expect(copy.title.length).toBeLessThanOrEqual(100);
    expect(copy.description.length).toBeLessThanOrEqual(800);
  });

  it("creates a valid hashtag for a multi-word city", () => {
    expect(pinterestCopy({ cityName: "New York" }).hashtags).toContain(
      "#NewYork",
    );
  });
});

describe("Instagram copy", () => {
  it("uses a dynamic country in the caption and alt text", () => {
    const copy = instagramCopy({ cityName: "Lisbon", country: "Portugal" });
    expect(copy.caption).toContain("Lisbon, Portugal.");
    expect(copy.caption).toContain("#Portugal");
    expect(copy.altText).toContain("Lisbon, Portugal");
  });

  it("omits the country when it is unknown", () => {
    const copy = instagramCopy({ cityName: "Lisbon" });
    expect(copy.caption).toContain("\nLisbon.\n");
    expect(copy.caption).not.toContain("#Morocco");
  });
});
