"use client";

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Eye, EyeOff, Maximize2, Minimize2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { parsedSegments } from "@/lib/segments";
import {
  DATA_DISPLAY_MODES,
  type DataDisplayMode,
  type DecodedItem,
  type ParseResult,
  type ParsedFrame,
  type TransportMode,
  type RegisterDisplayPreset as Template,
} from "@/lib/types";
import { VirtualList } from "@/components/virtual";
import TemplatePanel from "@/components/TemplatePanel";
import RegisterTable from "@/components/RegisterTable";
import AiTemplateCard from "@/components/AiTemplateCard";
import { AnnotatedFrame, Button, EmptyState, Field, Panel, Select, StatusBadge, TextArea, TextInput } from "@/components/ui";

export interface ParserState {
  text: string;
  transport: TransportMode;
  displayMode: DataDisplayMode;
  assumedStartAddress: number;
  expectedCountText: string;
  registerDisplayOverrides: Record<string, DataDisplayMode>;
  pointNames: Record<string, string>;
}

export type ExampleKind = "register" | "float" | "coil" | "exception";

export default function ResponseParser({
  state,
  result,
  parsing,
  selectedFrameIndex,
  templates,
  templateStatus,
  templateSaving,
  templateError,
  activeTemplate,
  onStateChange,
  onRegisterModeChange,
  onPointNameChange,
  onFrameSelect,
  onLoadExample,
  onSaveTemplate,
  onApplyTemplate,
  onDeleteTemplate,
  onRefreshTemplates,
  onAiTemplateApply,
}: {
  state: ParserState;
  result: ParseResult | null;
  parsing: boolean;
  selectedFrameIndex: number;
  templates: Template[];
  templateStatus: Parameters<typeof TemplatePanel>[0]["status"];
  templateSaving: boolean;
  templateError: string | null;
  activeTemplate: Template | null;
  onStateChange: (patch: Partial<ParserState>) => void;
  onRegisterModeChange: (address: number, mode: DataDisplayMode) => void;
  onPointNameChange: (address: number, name: string) => void;
  onParse: () => void;
  onFrameSelect: (index: number) => void;
  onLoadExample: (kind: ExampleKind) => void;
  onSaveTemplate: (name: string) => void;
  onApplyTemplate: (template: Template) => void;
  onDeleteTemplate: (template: Template) => void;
  onRefreshTemplates: () => void;
  onAiTemplateApply: (
    payload: Pick<Template, "name" | "startAddress" | "pointCount" | "defaultMode" | "overrides" | "pointNames">,
  ) => void | Promise<void>;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const selectedFrame = result?.frames[selectedFrameIndex] ?? result?.frames[0] ?? null;
  const registerRows = result?.registerRows ?? [];
  const firstAddress = registerRows[0]?.address ?? state.assumedStartAddress;
  const lastRow = registerRows.at(-1);
  const lastAddress = lastRow ? lastRow.address + lastRow.span - 1 : firstAddress;
  const suggestedName = `地址 ${firstAddress === lastAddress ? firstAddress : `${firstAddress}-${lastAddress}`}`;
  const crcResults = result?.frames.map((frame) => frame.crcIsValid).filter((value) => value !== undefined) ?? [];
  const validCrcCount = crcResults.filter(Boolean).length;
  const lengthResults = result?.frames.map((frame) => frame.lengthIsValid).filter((value) => value !== undefined) ?? [];
  const validLengthCount = lengthResults.filter(Boolean).length;
  const exceptionCount = result?.frames.filter((frame) => frame.isException).length ?? 0;

  useEffect(() => {
    if (!fullscreen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);

  return (
    <div className="space-y-4">
      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_250px_400px]">
        <Panel title="响应输入" subtitle="每行一条响应帧，粘贴时自动解析" bodyClassName="flex flex-col">
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid w-[180px] grid-cols-2 gap-1.5">
              {(["rtu", "tcp"] as const).map((mode) => (
                <Button
                  key={mode}
                  variant={state.transport === mode ? "primary" : "secondary"}
                  onClick={() => onStateChange({ transport: mode })}
                >
                  {mode.toUpperCase()}
                </Button>
              ))}
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-muted">载入示例</span>
              <div className="flex flex-wrap gap-1.5">
                {(["register", "float", "coil", "exception"] as const).map((kind) => (
                  <Button key={kind} variant="secondary" onClick={() => onLoadExample(kind)}>
                    {EXAMPLE_SHORT_LABELS[kind]}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-3 min-h-[104px] flex-1">
            <TextArea
              value={state.text}
              spellCheck={false}
              placeholder="01 03 04 00 2A 42 48 EB 6D"
              onChange={(event) => onStateChange({ text: event.target.value })}
              className="h-full resize-none"
            />
          </div>
        </Panel>

        <Panel title="解析选项" subtitle="只影响解码显示" bodyClassName="flex flex-col">
          <div className="space-y-3">
            <Field label="起始地址" hint="0...65535">
              <TextInput
                type="number"
                min={0}
                max={65535}
                value={state.assumedStartAddress}
                onChange={(event) => onStateChange({ assumedStartAddress: Number(event.target.value) })}
              />
            </Field>

            <Field label="数量" hint="留空为自动推断">
              <TextInput
                value={state.expectedCountText}
                placeholder="自动"
                onChange={(event) => onStateChange({ expectedCountText: event.target.value })}
              />
            </Field>

            <Field label="显示方式">
              <Select
                value={state.displayMode}
                onChange={(event) => onStateChange({ displayMode: event.target.value as DataDisplayMode })}
              >
                {DATA_DISPLAY_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <p className="mt-auto pt-3 text-[11px] leading-4 text-muted">起始地址和数量不参与 CRC 或 MBAP 校验。</p>
        </Panel>

        <AiTemplateCard onApply={onAiTemplateApply} />
      </div>

      <Panel
        title="解析结果"
        subtitle="状态、分段与解析值"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {result?.ok ? <StatusBadge tone="ok"><CheckCircle2 size={12} className="mr-1" />成功</StatusBadge> : null}
            {selectedFrame ? <StatusBadge tone="neutral">{selectedFrame.transport.toUpperCase()}</StatusBadge> : null}
            {result ? <StatusBadge tone="neutral">{result.frames.length.toLocaleString()} 条</StatusBadge> : null}
            {crcResults.length ? (
              <StatusBadge tone={validCrcCount === crcResults.length ? "ok" : "error"}>
                CRC {result!.frames.length === 1 ? (validCrcCount === crcResults.length ? "正常" : "失败") : `${validCrcCount}/${crcResults.length}`}
              </StatusBadge>
            ) : null}
            {lengthResults.length ? (
              <StatusBadge tone={validLengthCount === lengthResults.length ? "ok" : "warning"}>
                长度 {result!.frames.length === 1 ? (validLengthCount === lengthResults.length ? "正常" : "不一致") : `${validLengthCount}/${lengthResults.length}`}
              </StatusBadge>
            ) : null}
            {exceptionCount ? <StatusBadge tone="error"><XCircle size={12} className="mr-1" />异常 {exceptionCount}</StatusBadge> : null}
            {parsing ? <StatusBadge tone="neutral">Worker</StatusBadge> : null}
            {result?.stats ? <StatusBadge tone="neutral">{result.stats.durationMs.toFixed(1)} ms</StatusBadge> : null}
            {result?.ok ? (
              <Button variant="ghost" onClick={() => setShowDetails((value) => !value)} aria-expanded={showDetails}>
                {showDetails ? <EyeOff size={13} /> : <Eye size={13} />}
                {showDetails ? "隐藏详情" : "显示详情"}
              </Button>
            ) : null}
          </div>
        }
      >
        {result?.error || !result?.ok ? (
          <EmptyState title="等待有效响应" description="粘贴响应帧后自动解析。" />
        ) : (
          <div className="space-y-4">
            {showDetails ? (
              <div className="space-y-4">
                {selectedFrame?.isException ? (
                  <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <strong>{selectedFrame.exceptionTitle}</strong>
                    <div className="mt-1">{selectedFrame.exceptionDescription}</div>
                  </div>
                ) : null}

                {selectedFrame ? (
                  <>
                    <div className="grid gap-2 text-xs sm:grid-cols-4">
                      {selectedFrame.transport === "tcp" ? (
                        <>
                          <KeyValue label="事务号" value={selectedFrame.transactionId?.toString() ?? "-"} />
                          <KeyValue label="协议号" value={selectedFrame.protocolId?.toString() ?? "-"} />
                          <KeyValue label="MBAP 长度" value={selectedFrame.length?.toString() ?? "-"} />
                          <KeyValue label="从站地址" value={selectedFrame.unitId.toString()} />
                        </>
                      ) : (
                        <>
                          <KeyValue label="从站地址" value={selectedFrame.unitId.toString()} />
                          <KeyValue label="功能码" value={`0x${selectedFrame.functionCode.toString(16).toUpperCase().padStart(2, "0")}`} />
                          <KeyValue label="数据长度" value={`${selectedFrame.dataHex.split(" ").length} 字节`} />
                          <KeyValue label="CRC" value={selectedFrame.crcIsValid === undefined ? "-" : selectedFrame.crcIsValid ? "正确" : "错误"} />
                        </>
                      )}
                    </div>
                    <AnnotatedFrame segments={parsedSegments(selectedFrame)} />
                  </>
                ) : null}

                {result.frames.length > 1 ? (
                  <details className="rounded-md border border-line bg-neutral-50">
                    <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-[12px] font-semibold">
                      <ChevronRight size={14} className="details-chevron transition group-open:hidden" />
                      <ChevronDown size={14} className="hidden details-chevron-open transition group-open:block" />
                      帧列表（{result.frames.length.toLocaleString()}）
                    </summary>
                    <div className="border-t border-line p-2">
                      <VirtualList
                        count={result.frames.length}
                        rowHeight={48}
                        className="h-40"
                        renderItem={(index) => (
                          <FrameRow
                            frame={result.frames[index]}
                            selected={index === selectedFrameIndex}
                            onSelect={() => onFrameSelect(index)}
                          />
                        )}
                      />
                    </div>
                  </details>
                ) : null}

                {warnings(result.frames).map((warning) => (
                  <div key={warning} className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[12px] text-amber-800">
                    <AlertTriangle size={14} className="mt-0.5" /> {warning}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold tracking-tight">解析值</h3>
                  {registerRows.length ? (
                    <Button variant="ghost" onClick={() => setFullscreen(true)}>
                      <Maximize2 size={13} /> 全屏
                    </Button>
                  ) : null}
                </div>
                {registerRows.length ? (
                  <TemplatePanel
                    templates={templates}
                    status={templateStatus}
                    saving={templateSaving}
                    error={templateError}
                    suggestedName={suggestedName}
                    activeTemplate={activeTemplate}
                    canSave={registerRows.length > 0}
                    onSave={onSaveTemplate}
                    onApply={onApplyTemplate}
                    onDelete={onDeleteTemplate}
                    onRefresh={onRefreshTemplates}
                  />
                ) : null}
              </div>

              {registerRows.length ? (
                <RegisterTable
                  rows={registerRows}
                  frames={result.frames}
                  pointNames={state.pointNames}
                  onRegisterModeChange={onRegisterModeChange}
                  onPointNameChange={onPointNameChange}
                  className="max-h-[min(560px,60vh)]"
                />
              ) : result.frames.length === 1 && result.frames[0].decodedItems.length ? (
                result.frames[0].isBitRead ? (
                  <BitStateGrid items={result.frames[0].decodedItems} />
                ) : (
                  <VirtualList
                    count={result.frames[0].decodedItems.length}
                    rowHeight={44}
                    className="h-[min(560px,60vh)] rounded-md border border-line"
                    renderItem={(index) => {
                      const item = result.frames[0].decodedItems[index];
                      return (
                        <div className="grid h-11 grid-cols-[80px_150px_1fr_120px] items-center gap-2 border-b border-line px-3 text-[11px] last:border-0">
                          <span className="font-mono font-semibold">{item.address}</span>
                          <span className="truncate text-muted">{item.label}</span>
                          <span className="truncate font-mono" title={item.raw}>{item.raw}</span>
                          <span className="text-right font-semibold">{item.value}</span>
                        </div>
                      );
                    }}
                  />
                )
              ) : (
                <EmptyState title="没有可解析的数据值" description="寄存器读取显示多帧对比；线圈和写入回显显示明细。" />
              )}
            </div>
          </div>
        )}
      </Panel>

      {fullscreen ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-white/95 p-2 backdrop-blur-sm"
          onClick={() => setFullscreen(false)}
        >
          <div
            className="flex h-full w-full flex-col gap-2"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-1">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold tracking-tight">解析值 · 全屏查看</h3>
                <p className="mt-0.5 truncate text-[11px] text-muted">按 Esc 或点击空白处退出</p>
              </div>
              <Button variant="secondary" onClick={() => setFullscreen(false)}>
                <Minimize2 size={14} /> 退出全屏
              </Button>
            </div>
            <div className="min-h-0 flex-1">
              {result ? (
                <RegisterTable
                  rows={registerRows}
                  frames={result.frames}
                  pointNames={state.pointNames}
                  onRegisterModeChange={onRegisterModeChange}
                  onPointNameChange={onPointNameChange}
                  className="h-full"
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const EXAMPLE_SHORT_LABELS: Record<ExampleKind, string> = {
  register: "寄存器",
  float: "浮点",
  coil: "线圈",
  exception: "异常",
};

function warnings(frames: ParsedFrame[]): string[] {
  if (frames.length === 1) return frames[0]?.warnings ?? [];
  return frames.flatMap((frame, index) => frame.warnings.map((warning) => `第 ${index + 1} 条：${warning}`));
}

function BitStateGrid({ items }: { items: DecodedItem[] }) {
  return (
    <div className="flex flex-wrap gap-2 rounded-md border border-line bg-white p-3">
      {items.map((item) => {
        const on = item.value === "开" || item.note === "1";
        return (
          <div
            key={item.address}
            title={`${item.label}（${item.raw}）`}
            className={`flex h-9 w-[86px] items-center gap-1.5 rounded-md border px-2 transition ${
              on ? "border-emerald-300 bg-emerald-50" : "border-neutral-200 bg-neutral-50"
            }`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${on ? "bg-emerald-500" : "bg-neutral-300"}`} />
            <span className={`text-[12px] font-semibold ${on ? "text-emerald-700" : "text-neutral-400"}`}>{on ? "开" : "关"}</span>
            <span className="ml-auto font-mono text-[10px] text-muted">{item.address}</span>
          </div>
        );
      })}
    </div>
  );
}

function FrameRow({ frame, selected, onSelect }: { frame: ParsedFrame; selected: boolean; onSelect: () => void }) {
  const status = frame.isException
    ? "error"
    : frame.crcIsValid === false || frame.lengthIsValid === false || frame.warnings.length
      ? "warning"
      : "ok";

  return (
    <button
      onClick={onSelect}
      className={`mb-1.5 flex h-11 w-full items-center gap-3 rounded-md border px-2.5 text-left transition ${
        selected ? "border-accent bg-amber-50" : "border-line bg-white hover:bg-neutral-50"
      }`}
    >
      <span className="w-9 shrink-0 font-mono text-xs text-muted">#{frame.index + 1}</span>
      <span className="w-36 shrink-0 truncate text-xs font-semibold">{frame.functionName}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">{frame.rawHex}</span>
      <StatusBadge tone={status}>{status === "ok" ? "正常" : status === "warning" ? "警告" : "异常"}</StatusBadge>
    </button>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-neutral-50 p-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}
