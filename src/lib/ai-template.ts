import * as XLSX from "xlsx";
import { wordCount } from "@/lib/decoder";
import { DATA_DISPLAY_MODES, type DataDisplayMode, type RegisterDisplayPreset } from "@/lib/types";

export interface AiProviderSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const DEEPSEEK_PRESET: AiProviderSettings = {
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  model: "deepseek-chat",
};

const LS_KEY = "modbus-web-tools.ai-provider";

export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export function loadProviderSettings(): AiProviderSettings {
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiProviderSettings>;
      return {
        baseUrl: typeof parsed.baseUrl === "string" ? parsed.baseUrl : DEEPSEEK_PRESET.baseUrl,
        apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
        model: typeof parsed.model === "string" && parsed.model ? parsed.model : DEEPSEEK_PRESET.model,
      };
    }
  } catch {
    // ignore broken storage
  }
  return { ...DEEPSEEK_PRESET };
}

export function saveProviderSettings(settings: AiProviderSettings): void {
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(settings));
  } catch {
    // storage may be unavailable (private mode)
  }
}

/**
 * 直接调用 OpenAI 兼容 /chat/completions，合并 content 与 reasoning_content。
 * 用于 DeepSeek 等推理模型把 JSON 放进 reasoning_content、content 为空的情况。
 */
export async function rawChatCompletionText(
  settings: AiProviderSettings,
  messages: { role: "system" | "user"; content: string }[],
): Promise<string> {
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model.trim(),
      messages,
      temperature: 0,
      stream: false,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`模型调用失败（HTTP ${response.status}）${detail ? `：${detail.slice(0, 200)}` : ""}`);
  }
  const data = (await response.json()) as {
    choices?: { message?: { content?: string | null; reasoning_content?: string | null } }[];
  };
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error("模型响应缺少 choices。");
  const content = message.content ?? "";
  const reasoning = message.reasoning_content ?? "";
  return content.trim() || reasoning.trim();
}

/** 通过 OpenAI 兼容 /models 接口拉取可用模型列表 */
export async function fetchModelList(settings: AiProviderSettings): Promise<string[]> {
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  if (!baseUrl) throw new Error("请先填写 Base URL。");
  if (!settings.apiKey.trim()) throw new Error("请先填写 API Key。");
  const response = await fetch(`${baseUrl}/models`, {
    headers: { authorization: `Bearer ${settings.apiKey.trim()}` },
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("该服务未提供 /models 接口，请手动填写模型名。");
    }
    throw new Error(`拉取模型列表失败（HTTP ${response.status}），请手动填写模型名。`);
  }
  const data = (await response.json()) as { data?: { id?: string }[] };
  const models = (data.data ?? [])
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && Boolean(id));
  if (!models.length) throw new Error("模型列表为空，请手动填写模型名。");
  return models;
}

/** 把上传的 xlsx / xls 读取为紧凑文本，供 AI 理解 */
export async function workbookToText(file: File, maxRows = 500): Promise<string> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const blocks: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });
    const lines: string[] = [];
    for (let index = 0; index < rows.length && lines.length < maxRows; index += 1) {
      const row = rows[index] as unknown[];
      const cells = row.map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim()));
      if (cells.every((cell) => !cell)) continue;
      lines.push(cells.join("\t"));
    }
    if (!lines.length) continue;
    blocks.push(`## 工作表 ${sheetName}（共 ${rows.length} 行）\n` + lines.join("\n"));
  }
  if (!blocks.length) throw new Error("文件中没有可读取的工作表。");
  return blocks.join("\n\n");
}

/** 从模型输出中宽松地提取 JSON 对象 */
export function extractJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

const MODE_SET = new Set<string>(DATA_DISPLAY_MODES);

export interface AiPoint {
  address: number;
  name: string;
  mode: DataDisplayMode;
}

export interface ParsedPoints {
  points: AiPoint[];
  skipped: string[];
}

/** 校验并规范化 AI 输出点 */
export function normalizePoints(raw: unknown): ParsedPoints {
  const points: AiPoint[] = [];
  const skipped: string[] = [];
  const seen = new Set<number>();

  if (!raw || typeof raw !== "object") {
    skipped.push("AI 输出无法解析为 JSON 对象。");
    return { points, skipped };
  }
  const record = raw as Record<string, unknown>;
  const list = Array.isArray(raw)
    ? (raw as unknown[])
    : Array.isArray(record.points)
      ? (record.points as unknown[])
      : [];
  if (!list.length) {
    skipped.push("输出缺少 points 数组字段。");
  }
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const address = Number(obj.address);
    if (!Number.isInteger(address) || address < 0 || address > 65535) {
      skipped.push(`跳过非法地址 ${String(obj.address)}`);
      continue;
    }
    const mode = String(obj.mode ?? "").toUpperCase();
    if (!MODE_SET.has(mode)) {
      skipped.push(`地址 ${address}：未知解析方式 ${String(obj.mode)}`);
      continue;
    }
    const rawName = String(obj.name ?? "").trim().slice(0, 40);
    if (!rawName) {
      // 原表可能带类型但变量名为空（如 MCGS 通道表中间的空名行），保留占位避免点位“缺失”
      skipped.push(`地址 ${address}：原表该行无变量名，已按“未命名${address}”占位保留`);
    }
    const name = rawName || `未命名${address}`;
    if (seen.has(address)) {
      skipped.push(`地址 ${address}：重复，已跳过`);
      continue;
    }
    seen.add(address);
    points.push({ address, name, mode: mode as DataDisplayMode });
  }
  points.sort((a, b) => a.address - b.address);
  if (!points.length) skipped.push("没有任何有效点位。");
  return { points, skipped };
}

/** 由点位列表构造模板保存负载（不含 id / 时间戳）
 *
 * 解析表的行是按“从 startAddress 起、逐行按 mode 占用宽度推进”生成的，
 * 因此 defaultMode 必须是单字宽的 UINT16，保证任意奇/偶起始地址都能命中，
 * 32/64 位点位通过 overrides 在各自起始地址覆盖并自动跨占两个/四个 word。
 */
export function buildTemplatePayload(
  name: string,
  points: AiPoint[],
): Pick<RegisterDisplayPreset, "name" | "startAddress" | "pointCount" | "defaultMode" | "overrides" | "pointNames"> {
  const overrides: Record<string, DataDisplayMode> = {};
  const pointNames: Record<string, string> = {};
  let lastEnd = -1;
  for (const point of points) {
    pointNames[String(point.address)] = point.name;
    if (point.mode !== "UINT16") overrides[String(point.address)] = point.mode;
    lastEnd = Math.max(lastEnd, point.address + wordCount(point.mode));
  }
  const startAddress = points.length ? points[0].address : 0;
  return {
    name: name || `地址 ${startAddress} 起`,
    startAddress,
    pointCount: points.length ? lastEnd - startAddress : 0,
    defaultMode: "UINT16",
    overrides,
    pointNames,
  };
}
