const INLINE_WHITESPACE = new RegExp(
  "[ \\t\\f\\v\\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff]+",
  "g",
);
const HEX_PREFIX = /0x/gi;

export function compactInput(text: string): string {
  return text.replace(INLINE_WHITESPACE, "").replace(HEX_PREFIX, "");
}

export function byteHex(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, "0");
}

export function wordHex(value: number): string {
  return value.toString(16).toUpperCase().padStart(4, "0");
}

export function bytesHex(bytes: Uint8Array | number[], separator = " "): string {
  let result = "";
  for (let index = 0; index < bytes.length; index += 1) {
    if (index > 0) result += separator;
    result += byteHex(bytes[index]);
  }
  return result;
}

export function decimalAndHex(value: number): string {
  return `${value} / 0x${wordHex(value)}`;
}

const HEX_TOKEN = /^[0-9a-f]{1,2}$/;

export function parseHexBytes(text: string): Uint8Array {
  const normalized = text
    .toLowerCase()
    .replace(HEX_PREFIX, "")
    .replace(/[,;\t]/g, " ")
    .trim();

  if (!normalized) throw new Error("输入为空。");

  const rawTokens = normalized.split(/\s+/).filter(Boolean);
  let tokens = rawTokens;

  if (rawTokens.length === 1 && rawTokens[0].length > 2) {
    const compact = rawTokens[0];
    if (compact.length % 2 !== 0) {
      throw new Error(`无效十六进制字节：${compact}`);
    }
    tokens = compact.match(/.{2}/g) ?? [];
  }

  if (!tokens.length) throw new Error("输入为空。");

  const bytes = new Uint8Array(tokens.length);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!HEX_TOKEN.test(token)) throw new Error(`无效十六进制字节：${token}`);
    bytes[index] = Number.parseInt(token, 16);
  }
  return bytes;
}

export function wordAt(bytes: Uint8Array, index: number): number {
  return (bytes[index] << 8) | bytes[index + 1];
}
