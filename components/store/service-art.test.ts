import { describe, expect, it } from "vitest";
import { servicePicture } from "./service-art";

describe("servicePicture: only a media path of this site is a service picture", () => {
  const hash = "7db48410b0249faa175969aa2caa6d316adf34466f57a071ce6ad60e7bb1e022";

  it("accepts what the API sends", () => {
    expect(servicePicture(`/store/v1/media/${hash}.jpg`)).toBe(`/store/v1/media/${hash}.jpg`);
    expect(servicePicture(`/store/v1/media/${hash}.png`)).toBe(`/store/v1/media/${hash}.png`);
    expect(servicePicture(`/store/v1/media/${hash}.webp`)).toBe(`/store/v1/media/${hash}.webp`);
  });

  it("is null when the service has no picture", () => {
    expect(servicePicture(null)).toBeNull();
    expect(servicePicture(undefined)).toBeNull();
    expect(servicePicture("")).toBeNull();
  });

  it("refuses everything that is not one media file of this site", () => {
    for (const bad of [
      "https://evil.example/store/v1/media/a.jpg",
      "//evil.example/store/v1/media/a.jpg",
      "/store/v1/media/",
      "/store/v1/media/../files/a.jpg",
      "/store/v1/media/a/b.jpg",
      "/store/v1/media/a.jpg?w=1",
      "/store/v1/media/a.jpg#x",
      "/store/v1/media/.hidden",
      "/images/service-imei.jpg",
      "javascript:alert(1)",
      "data:image/png;base64,AAAA",
      " /store/v1/media/a.jpg",
    ]) {
      expect(servicePicture(bad), bad).toBeNull();
    }
  });
});
