"use client";

import { AlertTriangle, Cable, FileCode2 } from "lucide-react";
import { builtSegments } from "@/lib/segments";
import { type BuiltFrame, type CommandInput, type ModbusFunctionCode } from "@/lib/types";
import { AnnotatedFrame, Field, HexBlock, Panel, Select, StatusBadge, TextArea, TextInput } from "@/components/ui";

const FUNCTION_OPTIONS = [
  { value: 1, label: "01 读线圈" },
  { value: 2, label: "02 读离散输入" },
  { value: 3, label: "03 读保持寄存器" },
  { value: 4, label: "04 读输入寄存器" },
  { value: 5, label: "05 写单个线圈" },
  { value: 6, label: "06 写单个寄存器" },
  { value: 15, label: "15 写多个线圈" },
  { value: 16, label: "16 写多个寄存器" },
] as const;

function isRead(functionCode: ModbusFunctionCode) {
  return functionCode <= 4;
}

function isMultipleWrite(functionCode: ModbusFunctionCode) {
  return functionCode === 15 || functionCode === 16;
}

export default function CommandBuilder({
  command,
  built,
  error,
  onChange,
}: {
  command: CommandInput;
  built: BuiltFrame | null;
  error: string | null;
  onChange: (next: CommandInput) => void;
}) {
  function update(patch: Partial<CommandInput>) {
    onChange({ ...command, ...patch });
  }

  function updateFunction(nextFunction: ModbusFunctionCode) {
    const next: CommandInput = { ...command, functionCode: nextFunction };

    if (nextFunction === 1 || nextFunction === 2) next.quantity = Math.min(Math.max(next.quantity, 1), 2000);
    if (nextFunction === 3 || nextFunction === 4) next.quantity = Math.min(Math.max(next.quantity, 1), 125);
    if (nextFunction === 5) next.singleValue = next.singleValue === 0 ? 0 : 1;
    if (nextFunction === 15 && !isValidCoilValues(next.valuesText)) next.valuesText = "1, 0, 1, 1, 0, 0, 0, 1";
    if (nextFunction === 16 && (command.functionCode === 15 || !next.valuesText.trim())) next.valuesText = "1, 2, 3";

    onChange(next);
  }

  const segments = built ? builtSegments(built, command.functionCode) : [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[310px_310px]">
        <Panel title="传输方式" subtitle="RTU 带 CRC16，TCP 带 MBAP">
          <div className="space-y-3">
            <Field label="模式">
              <div className="grid h-8 grid-cols-2 gap-1 rounded-md border border-line bg-white p-0.5 text-[12px]">
                {(["rtu", "tcp"] as const).map((mode) => {
                  const active = command.transport === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => update({ transport: mode })}
                      className={`rounded px-2 font-medium transition ${
                        active ? "bg-foreground text-white" : "text-muted hover:text-foreground"
                      }`}
                    >
                      {mode.toUpperCase()}
                    </button>
                  );
                })}
              </div>
            </Field>
            {command.transport === "tcp" ? (
              <Field label="事务号" hint="0...65535">
                <TextInput
                  type="number"
                  min={0}
                  max={65535}
                  value={command.transactionId}
                  onChange={(event) => update({ transactionId: Number(event.target.value) })}
                />
              </Field>
            ) : null}
            <Field label="从站地址" hint="0...247">
              <TextInput
                type="number"
                min={0}
                max={247}
                value={command.unitId}
                onChange={(event) => update({ unitId: Number(event.target.value) })}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="功能参数" subtitle="协议限制自动套用">
          <div className="space-y-3">
            <Field label="功能码">
              <Select
                value={command.functionCode}
                onChange={(event) => updateFunction(Number(event.target.value) as ModbusFunctionCode)}
              >
                {FUNCTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="起始地址" hint="0...65535">
              <TextInput
                type="number"
                min={0}
                max={65535}
                value={command.startAddress}
                onChange={(event) => update({ startAddress: Number(event.target.value) })}
              />
            </Field>
            {isRead(command.functionCode) ? (
              <Field label="数量" hint={command.functionCode <= 2 ? "1...2000 位" : "1...125 寄存器"}>
                <TextInput
                  type="number"
                  min={1}
                  max={command.functionCode <= 2 ? 2000 : 125}
                  value={command.quantity}
                  onChange={(event) => update({ quantity: Number(event.target.value) })}
                />
              </Field>
            ) : null}
            {command.functionCode === 5 ? (
              <Field label="线圈值">
                <Select value={command.singleValue} onChange={(event) => update({ singleValue: Number(event.target.value) })}>
                  <option value={0}>关（0000）</option>
                  <option value={1}>开（FF00）</option>
                </Select>
              </Field>
            ) : null}
            {command.functionCode === 6 ? (
              <Field label="写入值" hint="0...65535">
                <TextInput
                  type="number"
                  min={0}
                  max={65535}
                  value={command.singleValue}
                  onChange={(event) => update({ singleValue: Number(event.target.value) })}
                />
              </Field>
            ) : null}
            {isMultipleWrite(command.functionCode) ? (
              <Field
                label={command.functionCode === 15 ? "线圈值" : "寄存器值"}
                hint={command.functionCode === 15 ? "0/1、true/false、on/off" : "十进制或 0x HEX"}
              >
                <TextArea
                  rows={3}
                  value={command.valuesText}
                  onChange={(event) => update({ valuesText: event.target.value })}
                  className="resize-none"
                />
              </Field>
            ) : null}
          </div>
        </Panel>
      </div>

      <Panel
        title="生成的报文"
        subtitle="ADU 可直接发送；PDU 不含传输头和校验"
        actions={built ? <StatusBadge tone="ok">{built.summary}</StatusBadge> : null}
      >
        {error ? (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[13px] text-amber-800">
            <AlertTriangle size={15} className="mt-0.5" />
            <span>{error}</span>
          </div>
        ) : null}

        {built ? (
          <div className="space-y-3">
            <div className="space-y-3">
              <HexBlock title="ADU" bytes={built.adu} />
              <HexBlock title="PDU" bytes={built.pdu} />
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-muted">
                <FileCode2 size={14} /> 字段拆解
              </div>
              <AnnotatedFrame segments={segments} />
            </div>
            {built.warnings.map((warning) => (
              <div key={warning} className="flex items-center gap-2 text-[13px] text-amber-700">
                <AlertTriangle size={14} /> {warning}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-28 items-center gap-2 text-[13px] text-muted">
            <Cable size={16} /> 修正参数后自动生成请求帧。
          </div>
        )}
      </Panel>
    </div>
  );
}

function isValidCoilValues(text: string): boolean {
  const tokens = text
    .replace(/[\n;]/g, ",")
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => ["0", "1", "true", "false", "on", "off"].includes(token));
}
