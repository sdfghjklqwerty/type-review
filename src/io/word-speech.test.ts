import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SpeechService, WordSpeaker, WordSpeechState } from "./word-speech";
import { createWordSpeaker } from "./word-speech";

function voice(name = "Local English", lang = "en-US", localService = true): SpeechSynthesisVoice {
  return { name, lang, localService, default: false, voiceURI: name };
}

class FakeSpeech extends EventTarget implements SpeechService {
  voices: SpeechSynthesisVoice[] = [voice()];
  spoken: SpeechSynthesisUtterance[] = [];
  getVoices = () => this.voices;
  speak = vi.fn((utterance: SpeechSynthesisUtterance) => {
    this.spoken.push(utterance);
  });
  cancel = vi.fn();
}

const utterance = (text: string) =>
  ({ text, onstart: null, onend: null, onerror: null }) as SpeechSynthesisUtterance;
const end = (item: SpeechSynthesisUtterance) => item.onend?.({} as SpeechSynthesisEvent);

describe("local word speech", () => {
  const players: WordSpeaker[] = [];
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    for (const player of players.splice(0)) player.dispose();
    vi.useRealTimers();
  });
  function setup(synthesis: SpeechService | null = new FakeSpeech()) {
    const states: WordSpeechState[] = [];
    const player = createWordSpeaker({
      synthesis,
      createUtterance: utterance,
      onState: (state) => states.push(state),
    });
    players.push(player);
    return { player, states };
  }

  it("prefers local English and never uses a remote voice", () => {
    const synth = new FakeSpeech();
    synth.voices = [
      voice("Remote", "en-US", false),
      voice("Chinese", "zh-CN"),
      voice("Local UK", "en-GB"),
    ];
    const { player, states } = setup(synth);
    player.speak("hello");
    expect(synth.spoken[0]?.voice?.name).toBe("Local UK");
    expect(states.at(-1)?.kind).toBe("ready");
  });

  it("waits for delayed voices and keeps only the most recent pending word", () => {
    const synth = new FakeSpeech();
    synth.voices = [];
    const { player, states } = setup(synth);
    player.speak("old");
    player.speak("latest");
    expect(synth.spoken).toHaveLength(0);
    synth.voices = [voice()];
    synth.dispatchEvent(new Event("voiceschanged"));
    expect(synth.spoken.map((item) => item.text)).toEqual(["latest"]);
    expect(states.at(-1)?.available).toBe(true);
  });

  it("reports missing English voices after a bounded loading period", () => {
    const synth = new FakeSpeech();
    synth.voices = [];
    const { player, states } = setup(synth);
    player.speak("hello");
    vi.advanceTimersByTime(3000);
    expect(states.at(-1)?.kind).toBe("no-voice");
    expect(states.at(-1)?.available).toBe(false);
    expect(synth.spoken).toHaveLength(0);
    player.speak("later");
    expect(states.at(-1)?.kind).toBe("no-voice");
  });

  it("does not silently fall back to remote English or another language", () => {
    const synth = new FakeSpeech();
    synth.voices = [voice("Remote", "en-US", false), voice("Chinese", "zh-CN")];
    const { player, states } = setup(synth);
    player.speak("hello");
    expect(states.at(-1)?.kind).toBe("no-voice");
    expect(synth.spoken).toHaveLength(0);
  });

  it("finishes the current word and skips stale waiting words during fast typing", () => {
    const synth = new FakeSpeech();
    const { player } = setup(synth);
    player.speak("one");
    player.speak("two");
    player.speak("three");
    expect(synth.spoken.map((item) => item.text)).toEqual(["one"]);
    synth.dispatchEvent(new Event("voiceschanged"));
    end(synth.spoken[0]!);
    expect(synth.spoken.map((item) => item.text)).toEqual(["one", "three"]);
  });

  it("cancels pending words and ignores stale completion events", () => {
    const synth = new FakeSpeech();
    const { player } = setup(synth);
    player.speak("one");
    player.speak("old");
    player.cancel();
    player.speak("new");
    end(synth.spoken[0]!);
    expect(synth.spoken.map((item) => item.text)).toEqual(["one", "new"]);
    expect(synth.cancel).toHaveBeenCalledOnce();
  });

  it("reports autoplay restrictions and allows retrying from a user action", () => {
    const synth = new FakeSpeech();
    const { player, states } = setup(synth);
    player.speak("hello");
    synth.spoken[0]!.onerror?.({ error: "not-allowed" } as SpeechSynthesisErrorEvent);
    expect(states.at(-1)?.kind).toBe("blocked");
    player.speak("hello");
    synth.spoken[1]!.onstart?.({} as SpeechSynthesisEvent);
    expect(states.at(-1)?.kind).toBe("ready");
  });

  it("contains native speech exceptions and detects a missing start event", () => {
    const synth = new FakeSpeech();
    const { player, states } = setup(synth);
    synth.speak.mockImplementationOnce(() => {
      throw new Error("device unavailable");
    });
    expect(() => player.speak("hello")).not.toThrow();
    expect(states.at(-1)?.kind).toBe("error");
    player.speak("again");
    vi.advanceTimersByTime(5000);
    expect(states.at(-1)?.message).toContain("did not start");
  });

  it("handles unavailable APIs and unregisters late voice events on disposal", () => {
    expect(setup(null).states.at(-1)?.kind).toBe("unsupported");
    const synth = new FakeSpeech();
    const { player } = setup(synth);
    player.speak("one");
    player.speak("two");
    player.dispose();
    end(synth.spoken[0]!);
    synth.dispatchEvent(new Event("voiceschanged"));
    player.speak("three");
    expect(synth.spoken).toHaveLength(1);
  });
});
