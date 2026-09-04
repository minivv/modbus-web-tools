export type TransportMode = "rtu" | "tcp";

export const DATA_DISPLAY_MODES = [
  "UINT16",
  "INT16",
  "UINT32_ABCD",
  "UINT32_CDAB",
  "UINT32_BADC",
  "UINT32_DCBA",
  "INT32_ABCD",
  "INT32_CDAB",
  "INT32_BADC",
  "INT32_DCBA",
  "FLOAT_ABCD",
  "FLOAT_CDAB",
  "FLOAT_BADC",
  "FLOAT_DCBA",
  "UINT64_ABCDEFGH",
  "UINT64_GHEFCDAB",
  "UINT64_BADCFEHG",
  "UINT64_HGFEDCBA",
  "INT64_ABCDEFGH",
  "INT64_GHEFCDAB",
  "INT64_BADCFEHG",
  "INT64_HGFEDCBA",
  "DOUBLE_ABCDEFGH",
  "DOUBLE_GHEFCDAB",
  "DOUBLE_BADCFEHG",
  "DOUBLE_HGFEDCBA",
] as const;

export type DataDisplayMode = (typeof DATA_DISPLAY_MODES)[number];

export const MODBUS_FUNCTIONS = [1, 2, 3, 4, 5, 6, 15, 16] as const;
export type ModbusFunctionCode = (typeof MODBUS_FUNCTIONS)[number];

export interface CommandInput {
  transport: TransportMode;
  transactionId: number;
  unitId: number;
  functionCode: ModbusFunctionCode;
  startAddress: number;
  quantity: number;
  singleValue: number;
  valuesText: string;
}

export interface BuiltFrame {
  transport: TransportMode;
  adu: Uint8Array;
  pdu: Uint8Array;
  payload: Uint8Array;
  summary: string;
  warnings: string[];
}

export interface DecodedItem {
  address: number;
  label: string;
  raw: string;
  value: string;
  note?: string;
}

export interface ParsedFrame {
  index: number;
  rawHex: string;
  rawBytes: Uint8Array;
  transport: TransportMode;
  transactionId?: number;
  protocolId?: number;
  length?: number;
  unitId: number;
  functionCode: number;
  functionName: string;
  isException: boolean;
  exceptionTitle?: string;
  exceptionDescription?: string;
  payloadHex: string;
  dataHex: string;
  crcExpected?: number;
  crcActual?: number;
  crcIsValid?: boolean;
  lengthIsValid?: boolean;
  warnings: string[];
  decodedItems: DecodedItem[];
  registerValues: number[];
  isRegisterRead: boolean;
  isBitRead: boolean;
}

export interface RegisterDecodeRow {
  address: number;
  span: number;
  mode: DataDisplayMode;
  raw: string;
  value: string;
  note: string;
}

export interface RegisterComparisonRow extends Omit<RegisterDecodeRow, "value" | "note"> {
  values: (RegisterDecodeRow | null)[];
}

export interface ParseStats {
  inputLength: number;
  lineCount: number;
  byteCount: number;
  frameCount: number;
  crcErrors: number;
  lengthErrors: number;
  exceptions: number;
  warnings: number;
  durationMs: number;
}

export interface ParseResult {
  ok: boolean;
  error?: string;
  frames: ParsedFrame[];
  registerRows: RegisterComparisonRow[];
  stats: ParseStats;
}

export interface ParseRequest {
  text: string;
  transport: TransportMode;
  displayMode: DataDisplayMode;
  assumedStartAddress: number;
  expectedCount?: number;
  registerDisplayOverrides: Record<string, DataDisplayMode>;
}

export interface RowsRequest {
  type: "rows";
  displayMode: DataDisplayMode;
  assumedStartAddress: number;
  registerDisplayOverrides: Record<string, DataDisplayMode>;
}

export type ParserWorkerRequest = ({ type: "parse" } & ParseRequest) | RowsRequest;

export interface RowsResponse {
  type: "rows";
  ok: boolean;
  rows: RegisterComparisonRow[];
  durationMs: number;
}

export interface ParseResponse {
  type: "parse";
  result: ParseResult;
}

export type ParserWorkerResponse = ParseResponse | RowsResponse;

export interface RegisterDisplayPreset {
  id: string;
  name: string;
  startAddress: number;
  pointCount: number;
  defaultMode: DataDisplayMode;
  overrides: Record<string, DataDisplayMode>;
  pointNames: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export type FrameSegmentKind =
  | "transport"
  | "address"
  | "function"
  | "addressRange"
  | "quantity"
  | "byteCount"
  | "data"
  | "checksum"
  | "exception"
  | "value";

export interface FrameSegment {
  id: string;
  label: string;
  bytes: Uint8Array;
  kind: FrameSegmentKind;
}
