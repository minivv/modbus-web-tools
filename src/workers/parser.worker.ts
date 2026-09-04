import { parseFrame } from "@/lib/codec";
import { registerRows } from "@/lib/decoder";
import { compactInput, parseHexBytes } from "@/lib/hex";
import type { ParserWorkerRequest, ParseRequest, ParseResult, ParsedFrame, RegisterComparisonRow } from "@/lib/types";

let cachedFrames: ParsedFrame[] = [];

function buildRegisterRows(
  frames: ParsedFrame[],
  request: ParseRequest,
): RegisterComparisonRow[] {
  if (!frames.length || !frames.every((frame) => frame.isRegisterRead)) return [];

  const rowsByFrame = frames.map((frame) =>
    registerRows(
      request.assumedStartAddress,
      frame.registerValues,
      request.displayMode,
      request.registerDisplayOverrides,
    ),
  );
  const firstRows = rowsByFrame[0] ?? [];
  const lookups = rowsByFrame.map((rows) => new Map(rows.map((row) => [row.address, row])));

  return firstRows.map((row) => ({
    address: row.address,
    span: row.span,
    mode: row.mode,
    raw: row.raw,
    values: lookups.map((lookup) => lookup.get(row.address) ?? null),
  }));
}

self.onmessage = (event: MessageEvent<ParserWorkerRequest>) => {
  const message = event.data;
  const started = performance.now();

  if (message.type === "rows") {
    const request = message;
    self.postMessage({
      type: "rows",
      ok: true,
      rows: buildRegisterRows(cachedFrames, {
        text: "",
        transport: "rtu",
        displayMode: request.displayMode,
        assumedStartAddress: request.assumedStartAddress,
        registerDisplayOverrides: request.registerDisplayOverrides,
      }),
      durationMs: performance.now() - started,
    });
    return;
  }

  const request: ParseRequest = message;

  try {
    const compacted = compactInput(request.text);
    const lines = compacted
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) throw new Error("输入为空。");

    const frames: ParsedFrame[] = [];
    let byteCount = 0;
    let crcErrors = 0;
    let lengthErrors = 0;
    let exceptions = 0;
    let warnings = 0;

    for (let index = 0; index < lines.length; index += 1) {
      try {
        const bytes = parseHexBytes(lines[index]);
        const frame = parseFrame(
          bytes,
          request.transport,
          request.displayMode,
          request.assumedStartAddress,
          request.expectedCount,
        );
        frame.index = index;
        frames.push(frame);
        byteCount += bytes.length;
        if (frame.crcIsValid === false) crcErrors += 1;
        if (frame.lengthIsValid === false) lengthErrors += 1;
        if (frame.isException) exceptions += 1;
        warnings += frame.warnings.length;
      } catch (error) {
        throw new Error(`第 ${index + 1} 条：${error instanceof Error ? error.message : "解析失败。"}`);
      }
    }

    const result: ParseResult = {
      ok: true,
      frames,
      registerRows: buildRegisterRows(frames, request),
      stats: {
        inputLength: request.text.length,
        lineCount: lines.length,
        byteCount,
        frameCount: frames.length,
        crcErrors,
        lengthErrors,
        exceptions,
        warnings,
        durationMs: performance.now() - started,
      },
    };
    cachedFrames = frames;

    self.postMessage({ type: "parse", result });
  } catch (error) {
    const result: ParseResult = {
      ok: false,
      error: error instanceof Error ? error.message : "解析失败。",
      frames: [],
      registerRows: [],
      stats: {
        inputLength: request.text.length,
        lineCount: 0,
        byteCount: 0,
        frameCount: 0,
        crcErrors: 0,
        lengthErrors: 0,
        exceptions: 0,
        warnings: 0,
        durationMs: performance.now() - started,
      },
    };
    cachedFrames = [];
    self.postMessage({ type: "parse", result });
  }
};
