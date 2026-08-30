import { describe, expect, it } from "vitest";
import {
  isAllowedExternalUrl,
  isAllowedNavigation,
} from "./navigation-policy.js";

describe("navigation policy", () => {
  it("allows only the application origin and local development server", () => {
    expect(isAllowedNavigation("app://fastmpa/index.html")).toBe(true);
    expect(isAllowedNavigation("http://localhost:5173/index.html")).toBe(true);
    expect(isAllowedNavigation("app://other/index.html")).toBe(false);
    expect(isAllowedNavigation("file:///secret.txt")).toBe(false);
  });

  it("allows HTTPS as the only external protocol", () => {
    expect(isAllowedExternalUrl("https://example.com")).toBe(true);
    expect(isAllowedExternalUrl("http://example.com")).toBe(false);
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
  });
});
