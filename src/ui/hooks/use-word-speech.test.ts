// @vitest-environment jsdom
import { createRoot } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WordSpeechControl } from "./use-word-speech";
import { createWordSpeech } from "./use-word-speech";

describe("word speech preference", () => {
  const cleanups: (() => void)[] = [];
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    vi.restoreAllMocks();
  });
  function setup(): WordSpeechControl {
    return createRoot((dispose) => {
      cleanups.push(dispose);
      return createWordSpeech({ synthesis: null });
    });
  }

  it("defaults on and remembers the user's disabled preference across mounting", () => {
    const first = setup();
    expect(first.enabled()).toBe(true);
    first.setEnabled(false);
    expect(localStorage.getItem("type-review:word-speech")).toBe("0");
    expect(setup().enabled()).toBe(false);
    first.setEnabled(true);
    expect(setup().enabled()).toBe(true);
  });

  it("remains usable when localStorage fails and preserves unrelated preferences", () => {
    localStorage.setItem("type-review:theme", "sepia");
    const preference = setup();
    preference.setEnabled(false);
    expect(localStorage.getItem("type-review:theme")).toBe("sepia");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    const blocked = setup();
    expect(blocked.enabled()).toBe(true);
    expect(() => blocked.setEnabled(false)).not.toThrow();
    expect(blocked.enabled()).toBe(false);
  });
});
