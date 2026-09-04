import { appendCrc, crc16 } from "@/lib/crc";
import { bitItems } from "@/lib/decoder";
import { bytesHex, byteHex, wordAt, wordHex } from "@/lib/hex";
import {
  MODBUS_FUNCTIONS,
  type BuiltFrame,
  type CommandInput,
  type DataDisplayMode,
  type DecodedItem,
  type ModbusFunctionCode,
  type ParsedFrame,
  type TransportMode,
} from "@/lib/types";

const FUNCTION_TITLES: Record<number, string> = {
  1: "01 读线圈",
  2: "02 读离散输入",
  3: "03 读保持寄存器",
  4: "04 读输入寄存器",
  5: "05 写单个线圈",
  6: "06 写单个寄存器",
  15: "15 写多个线圈",
  16: "16 写多个寄存器",
};

const EXCEPTIONS: Record<number, [string, string]> = {
  1: ["非法功能码", "设备不支持该功能码。"],
  2: ["非法数据地址", "请求地址不可写或不存在。"],
  3: ["非法数据值", "请求值超出设备允许范围。"],
  4: ["从站设备故障", "设备执行请求时发生故障。"],
  5: ["已确认", "设备已接收请求，处理时间较长。"],
  6: ["从站设备忙", "设备忙，请稍后重试。"],
  8: ["存储奇偶校验错误", "设备读取存储数据失败。"],
  10: ["网关路径不可用", "网关无法为请求分配路径。"],
  11: ["网关目标设备响应失败", "目标设备没有正确响应网关。"],
};

export function functionName(code: number): string {
  return FUNCTION_TITLES[code & 0x7f] ?? `0x${byteHex(code & 0x7f)}`;
}

function requireRange(value: number, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label}范围是 ${min}...${max}。`);
  }
}

function valueTokens(text: string): string[] {
  return text
    .replace(/[\n;]/g, ",")
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseBitValues(text: string): boolean[] {
  return valueTokens(text).map((token) => {
    const normalized = token.toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "on") return true;
    if (normalized === "0" || normalized === "false" || normalized === "off") return false;
    throw new Error(`线圈值只能是 0/1、true/false、on/off：${token}`);
  });
}

function parseRegisterValues(text: string): number[] {
  return valueTokens(text).map((token) => {
    const value = token.toLowerCase().startsWith("0x")
      ? Number.parseInt(token.slice(2), 16)
      : Number.parseInt(token, 10);
    if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new Error(`寄存器值超出 0...65535：${token}`);
    }
    return value;
  });
}

function packBits(bits: boolean[]): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((bit, index) => {
    if (bit) bytes[index >> 3] |= 1 << (index & 7);
  });
  return bytes;
}

function commandPayload(input: CommandInput): Uint8Array {
  switch (input.functionCode) {
    case 1:
    case 2:
    case 3:
    case 4: {
      const max = input.functionCode <= 2 ? 2000 : 125;
      requireRange(input.quantity, 1, max, "数量");
      return new Uint8Array([
        input.startAddress >> 8,
        input.startAddress & 0xff,
        input.quantity >> 8,
        input.quantity & 0xff,
      ]);
    }
    case 5: {
      if (input.singleValue !== 0 && input.singleValue !== 1) {
        throw new Error("单线圈写入值只能是 0 或 1。");
      }
      const value = input.singleValue === 1 ? 0xff00 : 0;
      return new Uint8Array([
        input.startAddress >> 8,
        input.startAddress & 0xff,
        value >> 8,
        value & 0xff,
      ]);
    }
    case 6:
      requireRange(input.singleValue, 0, 0xffff, "写入值");
      return new Uint8Array([
        input.startAddress >> 8,
        input.startAddress & 0xff,
        input.singleValue >> 8,
        input.singleValue & 0xff,
      ]);
    case 15: {
      const bits = parseBitValues(input.valuesText);
      if (!bits.length || bits.length > 1968) throw new Error("多线圈写入数量范围是 1...1968。");
      const packed = packBits(bits);
      const payload = new Uint8Array(5 + packed.length);
      payload.set([input.startAddress >> 8, input.startAddress & 0xff, bits.length >> 8, bits.length & 0xff, packed.length]);
      payload.set(packed, 5);
      return payload;
    }
    case 16: {
      const registers = parseRegisterValues(input.valuesText);
      if (!registers.length || registers.length > 123) throw new Error("多寄存器写入数量范围是 1...123。");
      const payload = new Uint8Array(5 + registers.length * 2);
      payload.set([
        input.startAddress >> 8,
        input.startAddress & 0xff,
        registers.length >> 8,
        registers.length & 0xff,
        registers.length * 2,
      ]);
      registers.forEach((value, index) => {
        const offset = 5 + index * 2;
        payload[offset] = value >> 8;
        payload[offset + 1] = value & 0xff;
      });
      return payload;
    }
  }
}

function commandSummary(input: CommandInput, payload: Uint8Array): string {
  switch (input.functionCode) {
    case 1:
    case 2:
    case 3:
    case 4:
      return `${FUNCTION_TITLES[input.functionCode]}，从站地址 ${input.unitId}，起始地址 ${input.startAddress}，数量 ${input.quantity}`;
    case 5:
      return `写单个线圈，从站地址 ${input.unitId}，地址 ${input.startAddress}，值 ${input.singleValue ? "开" : "关"}`;
    case 6:
      return `写单个寄存器，从站地址 ${input.unitId}，地址 ${input.startAddress}，值 ${input.singleValue}`;
    case 15:
      return `写多个线圈，从站地址 ${input.unitId}，起始地址 ${input.startAddress}，数量 ${payload[3] | (payload[2] << 8)}`;
    case 16:
      return `写多个寄存器，从站地址 ${input.unitId}，起始地址 ${input.startAddress}，数量 ${payload[3] | (payload[2] << 8)}`;
  }
}

export function buildCommand(input: CommandInput): BuiltFrame {
  requireRange(input.unitId, 0, 247, "从站地址");
  requireRange(input.startAddress, 0, 0xffff, "地址");
  if (input.transport === "tcp") requireRange(input.transactionId, 0, 0xffff, "事务号");

  const payload = commandPayload(input);
  const pdu = new Uint8Array(payload.length + 1);
  pdu[0] = input.functionCode;
  pdu.set(payload, 1);
  let adu: Uint8Array;

  if (input.transport === "rtu") {
    const body = new Uint8Array(pdu.length + 1);
    body[0] = input.unitId;
    body.set(pdu, 1);
    adu = appendCrc(body);
  } else {
    adu = new Uint8Array(7 + pdu.length);
    adu.set([input.transactionId >> 8, input.transactionId & 0xff, 0, 0, (pdu.length + 1) >> 8, (pdu.length + 1) & 0xff, input.unitId]);
    adu.set(pdu, 7);
  }

  return {
    transport: input.transport,
    adu,
    pdu,
    payload,
    summary: commandSummary(input, payload),
    warnings: input.transport === "tcp" ? ["TCP 报文包含 MBAP 头，不带 RTU CRC。"] : [],
  };
}

interface PayloadDecode {
  isException: boolean;
  exceptionTitle?: string;
  exceptionDescription?: string;
  dataBytes: Uint8Array;
  items: DecodedItem[];
  registerValues: number[];
  isRegisterRead: boolean;
  isBitRead: boolean;
}

function acknowledgeItems(functionCode: number, payload: Uint8Array, warnings: string[]): DecodedItem[] {
  if (payload.length < 4) {
    warnings.push("写入响应长度不足，正常应回显地址和值或数量。");
    return [];
  }
  const address = wordAt(payload, 0);
  const value = wordAt(payload, 2);
  let label: string;
  let displayValue: string;

  if (functionCode === 5) {
    label = `线圈 ${address}`;
    displayValue = value === 0xff00 ? "开" : value === 0 ? "关" : `0x${wordHex(value)}`;
  } else if (functionCode === 6) {
    label = `寄存器 ${address}`;
    displayValue = value.toString();
  } else if (functionCode === 15) {
    label = `线圈起始 ${address}`;
    displayValue = `${value} 个线圈`;
  } else {
    label = `寄存器起始 ${address}`;
    displayValue = `${value} 个寄存器`;
  }

  return [{ address, label, raw: bytesHex(payload), value: displayValue, note: "回显" }];
}

function decodePayload(
  functionCode: number,
  payload: Uint8Array,
  displayMode: DataDisplayMode,
  assumedStartAddress: number,
  expectedCount: number | undefined,
  warnings: string[],
): PayloadDecode {
  const base = {
    dataBytes: payload,
    items: [] as DecodedItem[],
    registerValues: [] as number[],
    isRegisterRead: false,
    isBitRead: false,
  };

  if (functionCode & 0x80) {
    const code = payload[0] ?? 0;
    const known = EXCEPTIONS[code];
    return {
      ...base,
      isException: true,
      exceptionTitle: known?.[0] ?? `异常 0x${byteHex(code)}`,
      exceptionDescription: known?.[1] ?? "设备返回了非标准异常码。",
    };
  }

  if (!MODBUS_FUNCTIONS.includes(functionCode as ModbusFunctionCode)) {
    warnings.push("未知或未内置解析的功能码，仅显示原始载荷。");
    return { ...base, isException: false };
  }

  if (functionCode === 1 || functionCode === 2) {
    const byteCount = payload[0];
    if (byteCount === undefined) {
      warnings.push("响应缺少 Byte Count。");
      return { ...base, isException: false };
    }
    const data = payload.slice(1);
    if (data.length !== byteCount) {
      warnings.push(`Byte Count 为 ${byteCount}，实际数据 ${data.length} 字节。`);
    }
    if (expectedCount !== undefined && expectedCount > data.length * 8) {
      warnings.push(`期望 ${expectedCount} 位，数据区仅能提供 ${data.length * 8} 位。`);
    }
    return { ...base, isException: false, dataBytes: data, items: bitItems(assumedStartAddress, data, expectedCount), isBitRead: true };
  }

  if (functionCode === 3 || functionCode === 4) {
    const byteCount = payload[0];
    if (byteCount === undefined) {
      warnings.push("响应缺少 Byte Count。");
      return { ...base, isException: false };
    }
    const data = payload.slice(1);
    if (data.length !== byteCount) {
      warnings.push(`Byte Count 为 ${byteCount}，实际数据 ${data.length} 字节。`);
    }
    if (data.length % 2 !== 0) warnings.push("寄存器数据字节数不是偶数，最后一个字节无法组成完整寄存器。");
    const registerValues: number[] = [];
    for (let index = 0; index + 1 < data.length; index += 2) {
      registerValues.push(wordAt(data, index));
    }
    return { ...base, isException: false, dataBytes: data, registerValues, isRegisterRead: true };
  }

  return {
    ...base,
    isException: false,
    items: acknowledgeItems(functionCode, payload, warnings),
  };
}

export function parseFrame(
  bytes: Uint8Array,
  transport: TransportMode,
  displayMode: DataDisplayMode,
  assumedStartAddress: number,
  expectedCount?: number,
): ParsedFrame {
  if (transport === "rtu") {
    if (bytes.length < 5) throw new Error("RTU 响应至少需要地址、功能码、数据和 2 字节 CRC。");
    const body = bytes.slice(0, bytes.length - 2);
    const expectedCrc = bytes[bytes.length - 2] | (bytes[bytes.length - 1] << 8);
    const actualCrc = crc16(body);
    const payload = body.slice(2);
    const warnings: string[] = [];
    if (expectedCrc !== actualCrc) warnings.push("CRC 校验不通过，可能是帧不完整、字节顺序错误或传输错误。");
    const decoded = decodePayload(bytes[1], payload, displayMode, assumedStartAddress, expectedCount, warnings);

    return {
      index: 0,
      rawHex: bytesHex(bytes),
      rawBytes: bytes,
      transport,
      unitId: bytes[0],
      functionCode: bytes[1],
      functionName: functionName(bytes[1]),
      payloadHex: bytesHex(payload),
      dataHex: bytesHex(decoded.dataBytes),
      crcExpected: expectedCrc,
      crcActual: actualCrc,
      crcIsValid: expectedCrc === actualCrc,
      warnings,
      decodedItems: decoded.items,
      registerValues: decoded.registerValues,
      isRegisterRead: decoded.isRegisterRead,
      isBitRead: decoded.isBitRead,
      isException: decoded.isException,
      exceptionTitle: decoded.exceptionTitle,
      exceptionDescription: decoded.exceptionDescription,
    };
  }

  if (bytes.length < 9) throw new Error("TCP 响应至少需要 7 字节 MBAP、功能码和数据。");
  const transactionId = wordAt(bytes, 0);
  const protocolId = wordAt(bytes, 2);
  const length = wordAt(bytes, 4);
  const payload = bytes.slice(8);
  const declaredTotal = length + 6;
  const lengthIsValid = declaredTotal === bytes.length;
  const warnings: string[] = [];
  if (protocolId !== 0) warnings.push("Protocol ID 不是 0，标准 Modbus TCP 应为 0。");
  if (!lengthIsValid) warnings.push(`MBAP Length 与实际帧长度不一致，声明总长 ${declaredTotal} 字节，实际 ${bytes.length} 字节。`);
  const decoded = decodePayload(bytes[7], payload, displayMode, assumedStartAddress, expectedCount, warnings);

  return {
    index: 0,
    rawHex: bytesHex(bytes),
    rawBytes: bytes,
    transport,
    transactionId,
    protocolId,
    length,
    unitId: bytes[6],
    functionCode: bytes[7],
    functionName: functionName(bytes[7]),
    payloadHex: bytesHex(payload),
    dataHex: bytesHex(decoded.dataBytes),
    lengthIsValid,
    warnings,
    decodedItems: decoded.items,
    registerValues: decoded.registerValues,
    isRegisterRead: decoded.isRegisterRead,
    isBitRead: decoded.isBitRead,
    isException: decoded.isException,
    exceptionTitle: decoded.exceptionTitle,
    exceptionDescription: decoded.exceptionDescription,
  };
}
