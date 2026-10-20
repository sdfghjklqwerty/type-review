import { describe, expect, it } from "vitest";
import { TextInput } from "./text-input";

function practice(text: string, options: { stopOnError?: boolean } = {}) {
  const words: string[] = [];
  const input = new TextInput(text, { ...options, onWord: (word) => words.push(word) });
  let time = 0;
  const type = (value: string) => {
    for (const char of value) {
      time += 100;
      input.appendChar(char, time);
    }
  };
  return { input, words, type };
}

describe("completed-word feedback", () => {
  it("waits for a separator and reads the final word without a trailing space", () => {
    const p = practice("hello world");
    p.type("hello");
    expect(p.words).toEqual([]);
    p.type(" ");
    expect(p.words).toEqual(["hello"]);
    p.type("world");
    expect(p.words).toEqual(["hello", "world"]);
    p.type(" ");
    expect(p.words).toEqual(["hello", "world"]);
  });

  it("handles punctuation, quotes, contractions, hyphens, and repeated words", () => {
    const text = "'don't', can’t well-known! go go.";
    const p = practice(text);
    p.type(text);
    expect(p.words).toEqual(["don't", "can’t", "well-known", "go", "go"]);
  });

  it("does not read a mistyped word, but reads it once after correction", () => {
    const p = practice("cat dog");
    p.type("cot ");
    expect(p.words).toEqual([]);
    for (let n = 0; n < 4; n++) p.input.backspace();
    p.type("cat ");
    expect(p.words).toEqual(["cat"]);
    for (let n = 0; n < 4; n++) p.input.backspace();
    p.type("cat dog");
    expect(p.words).toEqual(["cat", "dog"]);
  });

  it("does not commit a word when its separator was mistyped", () => {
    const p = practice("hello world");
    p.type("hellox");
    expect(p.words).toEqual([]);
    p.input.backspace();
    p.type(" ");
    expect(p.words).toEqual(["hello"]);
  });

  it("respects stop-on-error and reads after the accepted separator", () => {
    const p = practice("cat dog", { stopOnError: true });
    p.type("catx");
    expect(p.words).toEqual([]);
    p.type(" dog");
    expect(p.words).toEqual(["cat", "dog"]);
  });

  it("handles paragraph separators auto-skipped by the typing engine", () => {
    const p = practice("\nhello\n\nworld\n");
    p.type("helloworld");
    expect(p.words).toEqual(["hello", "world"]);
  });

  it("can read the same passage again after resetting", () => {
    const p = practice("hello");
    p.type("hello");
    p.input.reset();
    p.type("hello");
    expect(p.words).toEqual(["hello", "hello"]);
  });

  it("does not change typing state, accuracy, or timing logs", () => {
    const plain = new TextInput("hello world");
    const spoken = practice("hello world");
    let time = 0;
    for (const char of "hello world") {
      time += 100;
      plain.appendChar(char, time);
      spoken.type(char);
    }
    expect(spoken.input.snapshot()).toEqual(plain.snapshot());
    expect(spoken.input.steps).toEqual(plain.steps);
    expect(spoken.input.elapsedMs).toBe(plain.elapsedMs);
  });
});
