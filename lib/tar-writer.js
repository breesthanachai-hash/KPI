// Minimal streaming ustar writer used by the owner backup export.
// Kept as plain ESM so tests can exercise it directly without a TypeScript build.

const BLOCK_SIZE = 512;
const encoder = new TextEncoder();

function writeAscii(block, offset, value) {
  const bytes = encoder.encode(value);
  block.set(bytes, offset);
}

function writeOctal(block, offset, length, value) {
  // ustar numeric fields are zero-padded octal, NUL terminated.
  writeAscii(block, offset, value.toString(8).padStart(length - 1, "0") + "\0");
}

function splitName(name) {
  const bytes = encoder.encode(name);
  if (bytes.length <= 100) return { name, prefix: "" };
  const slash = name.lastIndexOf("/", name.length - 2);
  if (slash <= 0) throw new Error(`tar entry name is too long: ${name}`);
  const prefix = name.slice(0, slash);
  const rest = name.slice(slash + 1);
  if (encoder.encode(prefix).length > 155 || encoder.encode(rest).length > 100) {
    throw new Error(`tar entry name is too long: ${name}`);
  }
  return { name: rest, prefix };
}

export function tarHeader(entryName, size, mtimeSeconds) {
  if (!Number.isInteger(size) || size < 0) throw new Error(`invalid tar entry size for ${entryName}`);
  const { name, prefix } = splitName(entryName);
  const block = new Uint8Array(BLOCK_SIZE);
  writeAscii(block, 0, name);
  writeOctal(block, 100, 8, 0o644);
  writeOctal(block, 108, 8, 0);
  writeOctal(block, 116, 8, 0);
  writeOctal(block, 124, 12, size);
  writeOctal(block, 136, 12, Math.max(0, Math.floor(mtimeSeconds)));
  block.fill(0x20, 148, 156);
  block[156] = 0x30; // regular file
  writeAscii(block, 257, "ustar\0");
  writeAscii(block, 263, "00");
  writeAscii(block, 265, "people-pulse");
  writeAscii(block, 297, "people-pulse");
  writeOctal(block, 329, 8, 0);
  writeOctal(block, 337, 8, 0);
  writeAscii(block, 345, prefix);
  let checksum = 0;
  for (const byte of block) checksum += byte;
  writeAscii(block, 148, checksum.toString(8).padStart(6, "0") + "\0 ");
  return block;
}

function paddingFor(size) {
  const remainder = size % BLOCK_SIZE;
  return remainder === 0 ? 0 : BLOCK_SIZE - remainder;
}

export class TarWriter {
  /** @param {WritableStreamDefaultWriter<Uint8Array>} writer */
  constructor(writer, now = () => Date.now()) {
    this.writer = writer;
    this.now = now;
    this.entries = 0;
    this.bytes = 0;
    this.finished = false;
  }

  async #write(chunk) {
    await this.writer.write(chunk);
    this.bytes += chunk.byteLength;
  }

  async #open(name, size) {
    if (this.finished) throw new Error("tar archive is already finished");
    await this.#write(tarHeader(name, size, this.now() / 1000));
  }

  async #close(size) {
    const padding = paddingFor(size);
    if (padding) await this.#write(new Uint8Array(padding));
    this.entries += 1;
  }

  async addBytes(name, bytes) {
    await this.#open(name, bytes.byteLength);
    if (bytes.byteLength) await this.#write(bytes);
    await this.#close(bytes.byteLength);
  }

  async addText(name, text) {
    await this.addBytes(name, encoder.encode(text));
  }

  /**
   * Streams a body whose exact size is known up front (R2 objects report it).
   * A size mismatch aborts the archive instead of silently writing a corrupt entry.
   * @param {ReadableStream<Uint8Array>} stream
   */
  async addStream(name, size, stream) {
    await this.#open(name, size);
    let written = 0;
    const reader = stream.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        written += value.byteLength;
        if (written > size) throw new Error(`tar entry ${name} produced more than ${size} bytes`);
        await this.#write(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (written !== size) throw new Error(`tar entry ${name} produced ${written} bytes, expected ${size}`);
    await this.#close(size);
  }

  async finish() {
    if (this.finished) return;
    this.finished = true;
    await this.#write(new Uint8Array(BLOCK_SIZE * 2));
    await this.writer.close();
  }

  async abort(reason) {
    this.finished = true;
    await this.writer.abort(reason);
  }
}
