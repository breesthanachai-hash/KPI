export function tarHeader(entryName: string, size: number, mtimeSeconds: number): Uint8Array;

export class TarWriter {
  constructor(writer: WritableStreamDefaultWriter<Uint8Array>, now?: () => number);
  entries: number;
  bytes: number;
  finished: boolean;
  addBytes(name: string, bytes: Uint8Array): Promise<void>;
  addText(name: string, text: string): Promise<void>;
  addStream(name: string, size: number, stream: ReadableStream<Uint8Array>): Promise<void>;
  finish(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}
