import { DATA_DISPLAY_MODES, type DataDisplayMode, type RegisterDisplayPreset } from "@/lib/types";

const MAX_PRESET_COUNT = 24;

export function isDisplayMode(value: unknown): value is DataDisplayMode {
  return typeof value === "string" && (DATA_DISPLAY_MODES as readonly string[]).includes(value);
}

export function parsePresetInput(value: unknown): Omit<RegisterDisplayPreset, "id" | "createdAt" | "updatedAt"> | null {
  if (typeof value !== "object" || value === null) return null;
  const input = value as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 40) : "";
  const startAddress = Number(input.startAddress);
  const pointCount = Number(input.pointCount);
  const defaultMode = input.defaultMode;
  const overrides = input.overrides;
  const pointNames = input.pointNames;

  if (!name) return null;
  if (!Number.isInteger(startAddress) || startAddress < 0 || startAddress > 0xffff) return null;
  if (!Number.isInteger(pointCount) || pointCount < 0 || pointCount > 0xffff) return null;
  if (!isDisplayMode(defaultMode)) return null;

  const normalizedOverrides: Record<string, DataDisplayMode> = {};
  if (typeof overrides === "object" && overrides !== null) {
    for (const [address, mode] of Object.entries(overrides)) {
      const numericAddress = Number(address);
      if (Number.isInteger(numericAddress) && numericAddress >= 0 && numericAddress <= 0xffff && isDisplayMode(mode)) {
        normalizedOverrides[String(numericAddress)] = mode;
      }
    }
  }

  const normalizedNames: Record<string, string> = {};
  if (typeof pointNames === "object" && pointNames !== null) {
    for (const [address, rawName] of Object.entries(pointNames)) {
      const numericAddress = Number(address);
      const nameValue = typeof rawName === "string" ? rawName.trim().slice(0, 40) : "";
      if (Number.isInteger(numericAddress) && numericAddress >= 0 && numericAddress <= 0xffff && nameValue) {
        normalizedNames[String(numericAddress)] = nameValue;
      }
    }
  }

  return {
    name,
    startAddress,
    pointCount,
    defaultMode,
    overrides: normalizedOverrides,
    pointNames: normalizedNames,
  };
}

export function mapPresetRow(row: Record<string, unknown>): RegisterDisplayPreset {
  return {
    id: String(row.id),
    name: String(row.name),
    startAddress: Number(row.start_address),
    pointCount: Number(row.point_count),
    defaultMode: row.default_mode as DataDisplayMode,
    overrides: (row.overrides ?? {}) as Record<string, DataDisplayMode>,
    pointNames: (row.point_names ?? {}) as Record<string, string>,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("host");
  try {
    return !host || new URL(origin).host === host;
  } catch {
    return false;
  }
}

export { MAX_PRESET_COUNT };
