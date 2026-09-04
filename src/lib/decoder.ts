import { byteHex, wordHex } from "@/lib/hex";
import type { DataDisplayMode, DecodedItem } from "@/lib/types";

export function wordCount(mode: DataDisplayMode): number {
  if (mode === "UINT16" || mode === "INT16") return 1;
  if (mode.includes("32") || mode.startsWith("FLOAT")) return 2;
  return 4;
}

function bytesFromRegisters(registers: number[]): number[] {
  const bytes: number[] = [];
  for (const value of registers) {
    bytes.push(value >> 8, value & 0xff);
  }
  return bytes;
}

function order32(mode: DataDisplayMode): [number, number, number, number] {
  switch (mode) {
    case "UINT32_ABCD":
    case "INT32_ABCD":
    case "FLOAT_ABCD":
      return [0, 1, 2, 3];
    case "UINT32_CDAB":
    case "INT32_CDAB":
    case "FLOAT_CDAB":
      return [2, 3, 0, 1];
    case "UINT32_BADC":
    case "INT32_BADC":
    case "FLOAT_BADC":
      return [1, 0, 3, 2];
    default:
      return [3, 2, 1, 0];
  }
}

function order64(mode: DataDisplayMode): number[] {
  switch (mode) {
    case "UINT64_ABCDEFGH":
    case "INT64_ABCDEFGH":
    case "DOUBLE_ABCDEFGH":
      return [0, 1, 2, 3, 4, 5, 6, 7];
    case "UINT64_GHEFCDAB":
    case "INT64_GHEFCDAB":
    case "DOUBLE_GHEFCDAB":
      return [6, 7, 4, 5, 2, 3, 0, 1];
    case "UINT64_BADCFEHG":
    case "INT64_BADCFEHG":
    case "DOUBLE_BADCFEHG":
      return [1, 0, 3, 2, 5, 4, 7, 6];
    default:
      return [7, 6, 5, 4, 3, 2, 1, 0];
  }
}

function trimFloating(value: string): string {
  if (!value.includes(".")) return value === "-0" ? "0" : value;
  const trimmed = value.replace(/0+$/, "").replace(/\.$/, "");
  return trimmed === "-0" ? "0" : trimmed;
}

function formatFloating(value: number, fractionDigits: number): string {
  if (!Number.isFinite(value)) {
    if (Number.isNaN(value)) return "NaN";
    return value < 0 ? "-Infinity" : "Infinity";
  }
  if (Math.abs(value) >= 1_000_000_000_000) {
    return value.toExponential(fractionDigits);
  }
  return trimFloating(value.toFixed(fractionDigits));
}

function unsignedFromBytes(bytes: number[]): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function signedFromUnsigned(value: bigint, bits: number): string {
  const signBit = 1n << BigInt(bits - 1);
  if ((value & signBit) === 0n) return value.toString();
  return (value - (1n << BigInt(bits))).toString();
}

export function decodeRegisters(
  registers: number[],
  mode: DataDisplayMode,
): { raw: string; value: string; note: string } {
  const raw = registers.map((value) => `0x${wordHex(value)}`).join(" ");

  if (mode === "UINT16") {
    return { raw, value: registers.length ? registers[0].toString() : "-", note: mode };
  }
  if (mode === "INT16") {
    const value = registers.length ? (registers[0] << 16) >> 16 : null;
    return { raw, value: value === null ? "-" : value.toString(), note: mode };
  }

  const is32 = wordCount(mode) === 2;
  const required = is32 ? 2 : 4;
  if (registers.length < required) {
    return { raw, value: "数据不足", note: `需要 ${required} 个寄存器` };
  }

  const original = bytesFromRegisters(registers.slice(0, required));
  const ordered = is32
    ? order32(mode).map((index) => original[index])
    : order64(mode).map((index) => original[index]);
  const unsigned = unsignedFromBytes(ordered);
  let value: string;

  if (mode.startsWith("FLOAT")) {
    const view = new DataView(new ArrayBuffer(4));
    ordered.forEach((byte, index) => view.setUint8(index, byte));
    value = formatFloating(view.getFloat32(0), 6);
  } else if (mode.startsWith("DOUBLE")) {
    const view = new DataView(new ArrayBuffer(8));
    ordered.forEach((byte, index) => view.setUint8(index, byte));
    value = formatFloating(view.getFloat64(0), 12);
  } else if (mode.startsWith("INT")) {
    value = signedFromUnsigned(unsigned, is32 ? 32 : 64);
  } else {
    value = unsigned.toString();
  }

  return { raw, value, note: mode };
}

export function registerRows(
  startAddress: number,
  registers: number[],
  defaultMode: DataDisplayMode,
  overrides: Record<string, DataDisplayMode>,
): { address: number; span: number; mode: DataDisplayMode; raw: string; value: string; note: string }[] {
  const rows = [];
  let index = 0;

  while (index < registers.length) {
    const address = startAddress + index;
    const mode = overrides[String(address)] ?? defaultMode;
    const span = Math.min(wordCount(mode), registers.length - index);
    const decoded = decodeRegisters(registers.slice(index, index + span), mode);
    rows.push({ address, span, mode, ...decoded });
    index += Math.max(span, 1);
  }

  return rows;
}

export function registerItems(
  startAddress: number,
  registers: number[],
  displayMode: DataDisplayMode,
): DecodedItem[] {
  if (displayMode === "UINT16" || displayMode === "INT16") {
    return registers.map((value, offset) => ({
      address: startAddress + offset,
      label: `寄存器 ${startAddress + offset}`,
      raw: `0x${wordHex(value)}`,
      value: displayMode === "INT16" ? ((value << 16) >> 16).toString() : value.toString(),
      note: displayMode,
    }));
  }

  const step = wordCount(displayMode);
  const completeCount = registers.length - (registers.length % step);
  const items: DecodedItem[] = [];
  for (let offset = 0; offset < completeCount; offset += step) {
    const decoded = decodeRegisters(registers.slice(offset, offset + step), displayMode);
    const endAddress = startAddress + offset + step - 1;
    items.push({
      address: startAddress + offset,
      label: `寄存器 ${startAddress + offset}-${endAddress}`,
      ...decoded,
    });
  }
  return items;
}

export function bitItems(startAddress: number, bytes: Uint8Array, count?: number): DecodedItem[] {
  const available = bytes.length * 8;
  const limit = Math.min(count ?? available, available);
  const items: DecodedItem[] = [];
  for (let index = 0; index < limit; index += 1) {
    const bit = (bytes[index >> 3] >> (index & 7)) & 1;
    items.push({
      address: startAddress + index,
      label: `位 ${startAddress + index}`,
      raw: `字节 ${index >> 3}，位 ${index & 7}`,
      value: bit ? "开" : "关",
      note: bit.toString(),
    });
  }
  return items;
}

export function byteLabel(value: number): string {
  return byteHex(value);
}
