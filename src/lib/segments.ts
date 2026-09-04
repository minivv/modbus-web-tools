import type { BuiltFrame, FrameSegment, FrameSegmentKind, ModbusFunctionCode, ParsedFrame } from "@/lib/types";

function segment(label: string, bytes: Uint8Array | undefined, kind: FrameSegmentKind, id: string): FrameSegment | null {
  if (!bytes || bytes.length === 0) return null;
  return { id, label, bytes, kind };
}

function requestPayloadSegments(functionCode: ModbusFunctionCode, payload: Uint8Array): FrameSegment[] {
  if (functionCode <= 4) {
    return [
      segment("起始地址", payload.slice(0, 2), "addressRange", "start"),
      segment("数量", payload.slice(2, 4), "quantity", "quantity"),
    ].filter(Boolean) as FrameSegment[];
  }
  if (functionCode === 5 || functionCode === 6) {
    return [
      segment("地址", payload.slice(0, 2), "addressRange", "address"),
      segment("写入值", payload.slice(2, 4), "value", "value"),
    ].filter(Boolean) as FrameSegment[];
  }
  return [
    segment("起始地址", payload.slice(0, 2), "addressRange", "start"),
    segment("数量", payload.slice(2, 4), "quantity", "quantity"),
    segment("字节数", payload.slice(4, 5), "byteCount", "byteCount"),
    segment("写入数据", payload.slice(5), "data", "data"),
  ].filter(Boolean) as FrameSegment[];
}

export function builtSegments(frame: BuiltFrame, functionCode: ModbusFunctionCode): FrameSegment[] {
  if (frame.transport === "tcp") {
    return [
      segment("事务号", frame.adu.slice(0, 2), "transport", "transaction"),
      segment("协议号", frame.adu.slice(2, 4), "transport", "protocol"),
      segment("长度", frame.adu.slice(4, 6), "quantity", "length"),
      segment("从站地址", frame.adu.slice(6, 7), "address", "unit"),
      segment("功能码", frame.adu.slice(7, 8), "function", "function"),
      ...requestPayloadSegments(functionCode, frame.payload),
    ].filter(Boolean) as FrameSegment[];
  }
  if (functionCode >= 15) {
    return [
      segment("从站地址", frame.adu.slice(0, 1), "address", "unit"),
      segment("功能码", frame.adu.slice(1, 2), "function", "function"),
      ...requestPayloadSegments(functionCode, frame.payload),
      segment("CRC", frame.adu.slice(frame.adu.length - 2), "checksum", "crc"),
    ].filter(Boolean) as FrameSegment[];
  }
  if (frame.adu.length > 8) {
    return [
      segment("事务号", frame.adu.slice(0, 2), "transport", "transaction"),
      segment("协议号", frame.adu.slice(2, 4), "transport", "protocol"),
      segment("长度", frame.adu.slice(4, 6), "quantity", "length"),
      segment("从站地址", frame.adu.slice(6, 7), "address", "unit"),
      segment("功能码", frame.adu.slice(7, 8), "function", "function"),
      ...requestPayloadSegments(functionCode, frame.payload),
    ].filter(Boolean) as FrameSegment[];
  }
  return [
    segment("从站地址", frame.adu.slice(0, 1), "address", "unit"),
    segment("功能码", frame.adu.slice(1, 2), "function", "function"),
    ...requestPayloadSegments(functionCode, frame.payload),
    segment("CRC", frame.adu.slice(frame.adu.length - 2), "checksum", "crc"),
  ].filter(Boolean) as FrameSegment[];
}

function responsePayloadSegments(functionCode: number, payload: Uint8Array): FrameSegment[] {
  if (functionCode & 0x80) {
    return [segment("异常码", payload.slice(0, 1), "exception", "exception")].filter(Boolean) as FrameSegment[];
  }
  if ([1, 2, 3, 4].includes(functionCode)) {
    return [
      segment("数据长度", payload.slice(0, 1), "byteCount", "byteCount"),
      segment("数据", payload.slice(1), "data", "data"),
    ].filter(Boolean) as FrameSegment[];
  }
  if (functionCode === 5 || functionCode === 6) {
    return [
      segment("地址", payload.slice(0, 2), "addressRange", "address"),
      segment("回显值", payload.slice(2, 4), "value", "value"),
    ].filter(Boolean) as FrameSegment[];
  }
  if (functionCode === 15 || functionCode === 16) {
    return [
      segment("起始地址", payload.slice(0, 2), "addressRange", "start"),
      segment("数量", payload.slice(2, 4), "quantity", "quantity"),
    ].filter(Boolean) as FrameSegment[];
  }
  return [segment("Payload", payload, "data", "payload")].filter(Boolean) as FrameSegment[];
}

export function parsedSegments(frame: ParsedFrame): FrameSegment[] {
  if (frame.transport === "rtu") {
    return [
      segment("从站地址", frame.rawBytes.slice(0, 1), "address", "unit"),
      segment("功能码", frame.rawBytes.slice(1, 2), frame.isException ? "exception" : "function", "function"),
      ...responsePayloadSegments(frame.functionCode, frame.rawBytes.slice(2, frame.rawBytes.length - 2)),
      segment("CRC", frame.rawBytes.slice(frame.rawBytes.length - 2), "checksum", "crc"),
    ].filter(Boolean) as FrameSegment[];
  }
  return [
    segment("事务号", frame.rawBytes.slice(0, 2), "transport", "transaction"),
    segment("协议号", frame.rawBytes.slice(2, 4), "transport", "protocol"),
    segment("长度", frame.rawBytes.slice(4, 6), "quantity", "length"),
    segment("从站地址", frame.rawBytes.slice(6, 7), "address", "unit"),
    segment("功能码", frame.rawBytes.slice(7, 8), frame.isException ? "exception" : "function", "function"),
    ...responsePayloadSegments(frame.functionCode, frame.rawBytes.slice(8)),
  ].filter(Boolean) as FrameSegment[];
}
