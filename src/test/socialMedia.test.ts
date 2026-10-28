import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  backgroundColor,
  buildSocialVariant,
  variantGeometry,
} from "../../server/social/media";

async function source(width = 120, height = 60): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#ffffff",
    },
  })
    .jpeg()
    .toBuffer();
}

describe("social media variants", () => {
  it("uses the right geometry per platform and shape", () => {
    expect(variantGeometry("instagram", "square")).toEqual({ width: 1080, height: 1080 });
    expect(variantGeometry("instagram", "horizontal")).toEqual({ width: 1080, height: 810 });
    expect(variantGeometry("instagram", "vertical")).toEqual({ width: 1080, height: 1350 });
    expect(variantGeometry("pinterest", "square")).toEqual({ width: 1000, height: 1500 });
  });

  it("pads the image to the target dimensions as JPEG", async () => {
    const output = await buildSocialVariant(await source(), "instagram", "square", {
      background: "#101010",
    });
    const meta = await sharp(output).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1080);
  });

  it("builds a portrait Pinterest pin", async () => {
    const output = await buildSocialVariant(await source(300, 200), "pinterest", "horizontal", {
      background: "#ffffff",
    });
    const meta = await sharp(output).metadata();
    expect(meta.width).toBe(1000);
    expect(meta.height).toBe(1500);
  });

  it("validates the background colour", () => {
    expect(backgroundColor({ background: "#AbC123" })).toBe("#AbC123");
    expect(backgroundColor({ background: "red; drop table" })).toBe("#18181b");
    expect(backgroundColor(null)).toBe("#18181b");
  });
});
