export interface WordSpeechState {
  kind: "loading" | "ready" | "unsupported" | "no-voice" | "blocked" | "error";
  available: boolean;
  message: string;
}

export type SpeechService = Pick<
  SpeechSynthesis,
  "getVoices" | "speak" | "cancel" | "addEventListener" | "removeEventListener"
>;

export interface WordSpeakerOptions {
  /** Browser seams, injectable without an audio device in unit tests. */
  synthesis?: SpeechService | null;
  createUtterance?: (text: string) => SpeechSynthesisUtterance;
  onState?: (state: WordSpeechState) => void;
}

export interface WordSpeaker {
  speak: (word: string) => void;
  cancel: () => void;
  dispose: () => void;
}

/** Use a local English voice only; never silently send practice text to a
 * remote voice service. Speech is asynchronous with one current word and
 * one replaceable waiting word, so fast typing cannot create a long queue.
 */
export function createWordSpeaker(options: WordSpeakerOptions = {}): WordSpeaker {
  const synthesis =
    options.synthesis === undefined
      ? typeof window === "undefined"
        ? undefined
        : window.speechSynthesis
      : options.synthesis;
  const makeUtterance =
    options.createUtterance ??
    (typeof SpeechSynthesisUtterance === "undefined"
      ? undefined
      : (text: string) => new SpeechSynthesisUtterance(text));
  let disposed = false;
  let voice: SpeechSynthesisVoice | undefined;
  let current: SpeechSynthesisUtterance | null = null;
  let waiting: string | null = null;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let startTimer: ReturnType<typeof setTimeout> | undefined;
  let state: WordSpeechState | undefined;
  let loadFinished = false;

  const publish = (kind: WordSpeechState["kind"], message: string): void => {
    if (disposed) return;
    if (state?.kind === kind && state.message === message) return;
    state = { kind, available: voice !== undefined, message };
    options.onState?.(state);
  };
  const ready = (): void => publish("ready", `Local English voice: ${voice?.name}.`);
  const cancel = (): void => {
    const active = current !== null;
    current = null;
    waiting = null;
    clearTimeout(startTimer);
    if (active) {
      try {
        synthesis?.cancel();
      } catch {
        /* Speech must never break typing. */
      }
    }
  };

  const start = (word: string): void => {
    if (disposed || !voice || !synthesis || !makeUtterance) return;
    try {
      const utterance = makeUtterance(word);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.rate = 1;
      utterance.volume = 1;
      current = utterance; // Keep a strong reference until the browser finishes.
      utterance.onstart = () => {
        if (current !== utterance || disposed) return;
        clearTimeout(startTimer);
        ready();
      };
      utterance.onend = () => {
        if (current !== utterance || disposed) return;
        clearTimeout(startTimer);
        current = null;
        const next = waiting;
        waiting = null;
        if (next) start(next);
      };
      utterance.onerror = (event) => {
        if (current !== utterance || disposed) return;
        cancel();
        if (event.error === "canceled" || event.error === "interrupted") return;
        publish(
          event.error === "not-allowed" ? "blocked" : "error",
          event.error === "not-allowed"
            ? "Speech was blocked. Click test voice in settings > sound, then return to practice."
            : `Speech could not play (${event.error}). Try test voice in settings > sound.`,
        );
      };
      startTimer = setTimeout(() => {
        if (current !== utterance || disposed) return;
        cancel();
        publish(
          "error",
          "Speech did not start. Check audio output and try test voice in settings > sound.",
        );
      }, 5000);
      synthesis.speak(utterance);
    } catch {
      cancel();
      publish(
        "error",
        "Speech could not play. Check audio output and try test voice in settings > sound.",
      );
    }
  };

  const refreshVoices = (finishedLoading = false): void => {
    if (disposed || !synthesis) return;
    if (finishedLoading) loadFinished = true;
    try {
      const voices = synthesis.getVoices();
      if (voices.length > 0) loadFinished = true;
      const english = voices.filter(
        (item) => item.localService && /^en(?:[-_]|$)/i.test(item.lang),
      );
      voice =
        english.find((item) => item.default) ??
        english.find((item) => /^en[-_]US$/i.test(item.lang)) ??
        english[0];
      if (voice) {
        clearTimeout(loadTimer);
        ready();
        if (waiting && !current) {
          const next = waiting;
          waiting = null;
          start(next);
        }
      } else if (loadFinished) {
        waiting = null;
        publish(
          "no-voice",
          "No local English voice. Install an English speech voice in Windows settings. If already installed, fully restart the browser.",
        );
      } else {
        publish("loading", "Loading local English voices…");
      }
    } catch {
      publish("error", "English voices could not load. Try reloading the page.");
    }
  };
  const onVoicesChanged = (): void => refreshVoices();

  if (!synthesis || !makeUtterance) {
    publish(
      "unsupported",
      "Word pronunciation is unavailable in this browser. Try Chrome or Edge.",
    );
  } else {
    synthesis.addEventListener("voiceschanged", onVoicesChanged);
    refreshVoices();
    if (state?.kind === "loading") loadTimer = setTimeout(() => refreshVoices(true), 3000);
  }

  return {
    speak: (word) => {
      if (disposed || !synthesis || !makeUtterance || !word.trim()) return;
      if (!voice) refreshVoices();
      if (!voice) {
        if (state?.kind === "loading") waiting = word;
        return;
      }
      if (current) waiting = word;
      else start(word);
    },
    cancel,
    dispose: () => {
      disposed = true;
      cancel();
      clearTimeout(loadTimer);
      synthesis?.removeEventListener("voiceschanged", onVoicesChanged);
    },
  };
}
