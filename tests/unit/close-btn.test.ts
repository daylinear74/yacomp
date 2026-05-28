// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  resolveCloseBtnPosition — platform-aware fallback                        ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// The "auto" mode is the interesting case: it picks left on macOS/iOS (close
// goes near the traffic-light corner) and right elsewhere. Explicit "left" /
// "right" should always win regardless of platform.

import { describe, test, expect } from "bun:test";
import { resolveCloseBtnPosition } from "../../src/viewer/close-btn";

describe("resolveCloseBtnPosition", () => {
  test("explicit 'left' wins even on non-mac", () => {
    expect(resolveCloseBtnPosition("left", false)).toBe("left");
  });
  test("explicit 'right' wins even on mac", () => {
    expect(resolveCloseBtnPosition("right", true)).toBe("right");
  });
  test("auto on mac falls back to left", () => {
    expect(resolveCloseBtnPosition("auto", true)).toBe("left");
  });
  test("auto off mac falls back to right", () => {
    expect(resolveCloseBtnPosition("auto", false)).toBe("right");
  });
  test("explicit 'hide' wins regardless of platform", () => {
    expect(resolveCloseBtnPosition("hide", true)).toBe("hide");
    expect(resolveCloseBtnPosition("hide", false)).toBe("hide");
  });
});
