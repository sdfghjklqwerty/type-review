import type { CharStatus } from "./types";

interface WordBoundary {
  word: string;
  start: number;
  end: number;
  trigger: number;
}

/** Correct words are committed by a separator, or by the end of the passage.
 * Track positions, not word strings: repeated words at different positions
 * are independent, while backspacing over an already-read word is silent.
 * This runs on accepted engine input without cloning a snapshot per key.
 */
export class WordCompletion {
  private readonly words: WordBoundary[];
  private readonly spoken = new Set<number>();
  private next = 0;
  private position = 0;

  constructor(
    private readonly text: string,
    private readonly onWord: (word: string) => void,
  ) {
    this.words = Array.from(text.matchAll(/[a-z]+(?:['’-][a-z]+)*/gi), (match) => ({
      word: match[0],
      start: match.index,
      end: match.index + match[0].length,
      trigger: Math.min(text.length, match.index + match[0].length + 1),
    }));
  }

  update(position: number, statuses: readonly CharStatus[]): void {
    if (position <= this.position) {
      this.position = position;
      while (this.next > 0 && this.words[this.next - 1]!.trigger > position) this.next--;
      return;
    }
    this.position = position;
    while (this.next < this.words.length) {
      const item = this.words[this.next]!;
      if (item.trigger > position) break;
      this.next++;
      if (this.spoken.has(item.start)) continue;
      // A mistyped separator must not turn a partial/mistyped input into
      // pronunciation. Paragraph breaks are auto-skipped by TextInput.
      if (
        item.end < this.text.length &&
        this.text[item.end] !== "\n" &&
        statuses[item.end] !== "correct"
      )
        continue;
      let correct = true;
      for (let index = item.start; index < item.end; index++) {
        if (statuses[index] !== "correct") {
          correct = false;
          break;
        }
      }
      if (correct) {
        this.spoken.add(item.start);
        this.onWord(item.word);
      }
    }
  }

  reset(): void {
    this.next = 0;
    this.position = 0;
    this.spoken.clear();
  }
}
