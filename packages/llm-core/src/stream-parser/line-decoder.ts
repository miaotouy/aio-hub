export abstract class Utf8LineDecoder<T> {
  private readonly decoder = new TextDecoder();
  private buffer = "";
  private finished = false;

  push(chunk: Uint8Array): T[] {
    if (this.finished) {
      throw new Error("Cannot push data after the decoder has finished");
    }

    this.buffer += this.decoder.decode(chunk, { stream: true });
    return this.drain(false);
  }

  finish(): T[] {
    if (this.finished) return [];
    this.finished = true;
    this.buffer += this.decoder.decode();
    return this.drain(true);
  }

  protected abstract onLine(line: string): T[];

  protected abstract onFinish(): T[];

  private drain(final: boolean): T[] {
    const output: T[] = [];
    let start = 0;

    for (let index = 0; index < this.buffer.length; index++) {
      const character = this.buffer[index];
      if (character !== "\r" && character !== "\n") continue;
      if (!final && character === "\r" && index === this.buffer.length - 1)
        break;

      output.push(...this.onLine(this.buffer.slice(start, index)));
      if (character === "\r" && this.buffer[index + 1] === "\n") index++;
      start = index + 1;
    }

    this.buffer = this.buffer.slice(start);
    if (final) {
      if (this.buffer.length > 0) output.push(...this.onLine(this.buffer));
      this.buffer = "";
      output.push(...this.onFinish());
    }

    return output;
  }
}
