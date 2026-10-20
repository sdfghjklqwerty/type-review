import type { Accessor } from "solid-js";
import { createSignal, onCleanup } from "solid-js";
import type { WordSpeakerOptions, WordSpeechState } from "../../io/word-speech";
import { createWordSpeaker } from "../../io/word-speech";

const STORAGE_KEY = "type-review:word-speech";

function readEnabled(): boolean {
  try {
    return typeof localStorage === "undefined" || localStorage.getItem(STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export interface WordSpeechControl {
  enabled: Accessor<boolean>;
  setEnabled: (enabled: boolean) => void;
  state: Accessor<WordSpeechState>;
  speak: (word: string) => void;
  cancel: () => void;
  preview: () => void;
}

/** Browser-only preference, like key sounds: no profile schema migration. */
export function createWordSpeech(
  options: Omit<WordSpeakerOptions, "onState"> = {},
): WordSpeechControl {
  const [enabled, setEnabledSignal] = createSignal(readEnabled());
  const [state, setState] = createSignal<WordSpeechState>({
    kind: "loading",
    available: false,
    message: "Loading local English voices…",
  });
  const player = createWordSpeaker({ ...options, onState: setState });
  onCleanup(() => player.dispose());
  const speak = (word: string): void => {
    if (enabled()) player.speak(word);
  };
  return {
    enabled,
    setEnabled: (next) => {
      setEnabledSignal(next);
      if (!next) player.cancel();
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* The toggle still works when storage is unavailable. */
      }
    },
    state,
    speak,
    cancel: player.cancel,
    preview: () => {
      player.cancel();
      speak("hello");
    },
  };
}
