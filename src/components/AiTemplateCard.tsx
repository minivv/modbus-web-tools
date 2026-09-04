"use client";

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { CheckCircle2, Database, FileUp, Loader2, RotateCcw, Settings, Sparkles, WandSparkles, X, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import type { RegisterDisplayPreset } from "@/lib/types";
import {
  DEEPSEEK_PRESET,
  type AiPoint,
  buildTemplatePayload,
  extractJsonObject,
  fetchModelList,
  loadProviderSettings,
  normalizePoints,
  normalizeBaseUrl,
  rawChatCompletionText,
  saveProviderSettings,
  workbookToText,
} from "@/lib/ai-template";
import { Button, Field, Panel, StatusBadge, TextArea, TextInput } from "@/components/ui";

const SYSTEM_PROMPT = `你是工业组态（MCGS/Modbus）点位表专家。任务：把用户提供的点位表或文字描述，解析成 Modbus 4 区保持寄存器解析模板。

规则：
- 若输入是组态导出表文本（以 ## 工作表 开头，制表符分隔），找到表头行，逐数据行解析。表头含 变量名/寄存器名称/数据类型/寄存器地址/地址偏移/通道名称 等列。
- "寄存器地址"列按 1 编号（对应 4xxxx 区的 40001..），转换为从 0 开始的寄存器序号：address = 寄存器地址 - 1 + (地址偏移列数值，为空则 0)。
- 数据类型 → 解析方式（保持寄存器原始大端顺序）：
  "16位 无符号二进制"/含"16位 无符号" → UINT16；"16位 有符号二进制"/含"16位 有符号" → INT16；
  "32位 浮点数"/FLOAT → FLOAT_ABCD；"32位 无符号二进制" → UINT32_ABCD；"32位 有符号二进制" → INT32_ABCD；
  "64位"/DOUBLE → DOUBLE_ABCDEFGH；无法识别但占用 2 个寄存器间隔 → FLOAT_ABCD；其余默认 UINT16。
- 点位名称取"变量名"列原文（最多 40 字）。**若该行"变量名"为空**（有类型、无名称，如组态表中间的空名行），不要省略，名称用"未命名{address}"（address 为 0-based 起始寄存器序号）。跳过行首元数据（如"组态设备名称:..."）。重复地址只保留第一个。
- 若输入是纯文字描述，按描述推断连续地址从 0 开始依次编号。

只输出一个 JSON 对象，不要 markdown、不要解释、不要代码块：
{"points":[{"address":0,"name":"名称","mode":"UINT16"}]}`;

type TemplatePayload = Pick<RegisterDisplayPreset, "name" | "startAddress" | "pointCount" | "defaultMode" | "overrides" | "pointNames">;

export default function AiTemplateCard({
  onApply,
}: {
  onApply: (payload: TemplatePayload) => void | Promise<void>;
}) {
  const [settings, setSettings] = useState(loadProviderSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState<"" | "fetch" | "test" | "generate">("");
  const [cardNotice, setCardNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const [result, setResult] = useState<{ points: AiPoint[]; skipped: string[]; raw: string } | null>(null);
  const [applied, setApplied] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [extraText, setExtraText] = useState("");
  const [templateName, setTemplateName] = useState("");
  const fileRef = useRef<{ file: File | null } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const configured = Boolean(settings.apiKey.trim() && normalizeBaseUrl(settings.baseUrl));
  const configuredText = configured ? "已设置" : "未设置";
  const suggestName = fileName.replace(/\.(xlsx|xls|csv)$/i, "") || "AI 模板";
  const hasSource = Boolean(fileName) || extraText.trim().length > 0;

  function patchSettings(patch: Partial<typeof settings>) {
    setSettings((current) => {
      const next = { ...current, ...patch };
      saveProviderSettings(next);
      return next;
    });
  }

  async function runFetch() {
    setBusy("fetch");
    setSettingsNotice(null);
    try {
      const list = await fetchModelList(settings);
      setModels(list);
      patchSettings({ model: settings.model || list[0] || "" });
      setSettingsNotice({ tone: "ok", text: `连接正常 · 共 ${list.length} 个模型` });
    } catch (cause) {
      setSettingsNotice({ tone: "error", text: cause instanceof Error ? cause.message : "拉取失败。" });
    } finally {
      setBusy("");
    }
  }

  async function runTest() {
    setBusy("test");
    setSettingsNotice(null);
    try {
      const list = await fetchModelList(settings);
      setModels(list);
      setSettingsNotice({
        tone: "ok",
        text: settings.model ? `测试通过 · 共 ${list.length} 个模型，可开始生成` : `连接正常 · ${list.length} 个模型已拉取，请选择模型`,
      });
    } catch (cause) {
      setSettingsNotice({ tone: "error", text: cause instanceof Error ? cause.message : "连接失败。" });
    } finally {
      setBusy("");
    }
  }

  async function generate() {
    if (!hasSource) {
      setCardNotice({ tone: "error", text: "请先上传 Excel 文件或填写文字描述。" });
      return;
    }
    if (!configured) {
      setCardNotice({ tone: "error", text: "请先在设置中填写 API Key。" });
      setSettingsOpen(true);
      return;
    }
    setBusy("generate");
    setCardNotice(null);
    try {
      const sections: string[] = [];
      const file = fileRef.current?.file ?? null;
      if (file) sections.push(await workbookToText(file));
      if (extraText.trim()) sections.push(`## 补充说明\n${extraText.trim()}`);
      const userPrompt = sections.join("\n\n") || "没有可用内容。";

      let modelText = "";
      try {
        const provider = createOpenAI({
          apiKey: settings.apiKey.trim(),
          baseURL: normalizeBaseUrl(settings.baseUrl),
        });
        const completion = await generateText({
          model: provider.chat(settings.model.trim()),
          system: SYSTEM_PROMPT,
          prompt: userPrompt,
          temperature: 0,
        });
        if (completion.text?.trim()) modelText = completion.text;
        else {
          const reasoningText = (completion.reasoning ?? [])
            .filter((part): part is Extract<typeof part, { type: "reasoning" }> => part.type === "reasoning")
            .map((part) => part.text)
            .join("\n");
          if (reasoningText.trim()) modelText = reasoningText;
        }
      } catch (cause) {
        // SDK 侧失败（认证、断网、限流等）直接上抛，不走裸请求兜底
        throw cause;
      }
      // DeepSeek 等推理模型会把内容放进 reasoning_content 而非 content，SDK 拿不到时走裸请求
      if (!modelText.trim()) {
        modelText = await rawChatCompletionText(settings, [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ]);
      }

      const rawJson = extractJsonObject(modelText);
      const { points, skipped } = normalizePoints(rawJson);
      if (!points.length) throw new Error(skipped[0] ?? "AI 未能生成有效点位。");
      setResult({ points, skipped, raw: modelText });
      setApplied(false);
      setApplyError(null);
      setResultOpen(true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "生成失败。";
      setCardNotice({ tone: "error", text: /http|status|rate|limit/i.test(message) ? `模型调用失败：${message}` : message });
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <Panel
        title="AI 生成模板"
        subtitle="从 Excel 或描述生成解析模板"
        actions={
          <>
            <StatusBadge tone={configured ? "ok" : "neutral"}>
              {configured ? <CheckCircle2 size={12} className="mr-1" /> : null}
              {configuredText}
            </StatusBadge>
            <Button variant="secondary" className="!h-7 !px-2 !text-[12px]" onClick={() => setSettingsOpen(true)}>
              <Settings size={13} /> 设置
            </Button>
          </>
        }
        bodyClassName="flex flex-col"
      >
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full items-center gap-2 rounded-md border border-dashed border-line bg-white px-3 py-2.5 text-left text-[12px] transition hover:border-accent hover:bg-neutral-50"
          >
            <FileUp size={15} className="shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate">
              {fileName ? (
                <span className="font-medium text-foreground">{fileName}</span>
              ) : (
                <span className="text-muted">点击上传 Excel 点位表（.xlsx / .xls / .csv）</span>
              )}
            </span>
            {fileName ? (
              <span
                role="button"
                tabIndex={0}
                className="shrink-0 rounded p-0.5 text-muted hover:bg-neutral-100 hover:text-foreground"
                onClick={(event) => {
                  event.stopPropagation();
                  setFileName("");
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    setFileName("");
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }
                }}
              >
                <X size={13} />
              </span>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setFileName(file ? file.name : "");
                fileRef.current = { file };
              }}
            />
          </button>

          <Field label="补充文字（可选）" hint="说明列含义、命名规则等">
            <TextArea
              rows={3}
              value={extraText}
              placeholder="例如：32 位按两个寄存器一组、点名为 xx"
              onChange={(event) => setExtraText(event.target.value)}
              className="resize-none"
            />
          </Field>
        </div>

        {cardNotice && cardNotice.tone === "error" ? (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 p-2 text-[11px] leading-4 text-red-700">
            <XCircle size={13} className="mt-0.5 shrink-0" /> {cardNotice.text}
          </div>
        ) : null}
        {cardNotice && cardNotice.tone === "ok" ? (
          <div className="mt-2 flex items-start gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 p-2 text-[11px] leading-4 text-emerald-700">
            <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> {cardNotice.text}
          </div>
        ) : null}

        <div className="mt-auto pt-3">
          <Button variant="primary" className="w-full" disabled={busy === "generate" || !hasSource} onClick={generate}>
            {busy === "generate" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy === "generate" ? "正在生成…" : "生成模板"}
          </Button>
        </div>
      </Panel>

      {settingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-white/95 p-4 backdrop-blur-sm" onClick={() => setSettingsOpen(false)}>
          <div
            className="my-6 w-full max-w-md space-y-3 rounded-xl border border-line bg-paper p-4 shadow-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Database size={16} className="mt-0.5 text-amber-600" />
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">模型服务设置</h3>
                  <p className="mt-0.5 text-[11px] text-muted">OpenAI 兼容接口，默认适配 DeepSeek</p>
                </div>
              </div>
              <Button variant="ghost" onClick={() => setSettingsOpen(false)} aria-label="关闭">
                <X size={16} />
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-md border border-line bg-neutral-50 px-3 py-2">
              <span className="text-[11px] font-medium text-muted">快捷填充</span>
              <Button
                variant="secondary"
                className="!h-7 !px-2 !text-[12px]"
                onClick={() => patchSettings({ ...DEEPSEEK_PRESET, apiKey: settings.apiKey })}
              >
                DeepSeek
              </Button>
            </div>

            <Field label="Base URL">
              <TextInput
                value={settings.baseUrl}
                spellCheck={false}
                placeholder="OpenAI 兼容接口地址"
                onChange={(event) => patchSettings({ baseUrl: event.target.value })}
              />
            </Field>

            <Field label="API Key" hint="只保存在本机浏览器，请求由页面直连模型服务">
              <TextInput
                type="password"
                value={settings.apiKey}
                autoComplete="off"
                placeholder="sk-..."
                onChange={(event) => patchSettings({ apiKey: event.target.value })}
              />
            </Field>

            <Field label="模型">
              <div className="flex gap-1.5">
                <TextInput
                  value={settings.model}
                  spellCheck={false}
                  list="ai-model-options"
                  placeholder="模型名"
                  onChange={(event) => patchSettings({ model: event.target.value })}
                  className="!flex-1"
                />
                <Button variant="secondary" disabled={busy === "fetch"} onClick={runFetch}>
                  {busy === "fetch" ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
                  拉取
                </Button>
              </div>
              <datalist id="ai-model-options">
                {models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </Field>

            {settingsNotice ? (
              <div
                className={`flex items-start gap-1.5 rounded-md border p-2 text-[11px] leading-4 ${
                  settingsNotice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {settingsNotice.tone === "ok" ? <CheckCircle2 size={13} className="mt-0.5 shrink-0" /> : <XCircle size={13} className="mt-0.5 shrink-0" />}
                {settingsNotice.text}
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" disabled={busy === "test"} onClick={runTest}>
                {busy === "test" ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                测试连接
              </Button>
              <Button variant="primary" onClick={() => setSettingsOpen(false)}>
                完成
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {resultOpen && result ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-white/95 p-4 backdrop-blur-sm" onClick={() => setResultOpen(false)}>
          <div
            className="my-6 w-full max-w-2xl space-y-3 rounded-xl border border-line bg-paper p-4 shadow-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <WandSparkles size={16} className="mt-0.5 text-amber-600" />
                <div>
                  <h3 className="text-sm font-semibold tracking-tight">模板生成结果</h3>
                  <p className="mt-0.5 text-[11px] text-muted">确认无误后应用并保存到模板列表</p>
                </div>
              </div>
              <Button variant="ghost" onClick={() => setResultOpen(false)} aria-label="关闭">
                <X size={16} />
              </Button>
            </div>

            {applied ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-center gap-2 text-[13px] text-emerald-700">
                  <CheckCircle2 size={15} /> 模板已应用并保存。
                </div>
                <Button variant="secondary" onClick={() => setResultOpen(false)}>
                  完成
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <Field label="模板名称" className="min-w-[200px] flex-1">
                    <TextInput value={templateName} placeholder={suggestName} onChange={(event) => setTemplateName(event.target.value)} />
                  </Field>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setResultOpen(false)}>
                      <RotateCcw size={14} /> 返回
                    </Button>
                    <Button
                      variant="primary"
                      disabled={busy === "generate"}
                      onClick={async () => {
                        const payload = buildTemplatePayload(templateName.trim() || suggestName, result.points);
                        setBusy("generate");
                        setApplyError(null);
                        try {
                          await onApply(payload);
                          setApplied(true);
                          setCardNotice({ tone: "ok", text: "模板已应用并保存到模板列表。" });
                        } catch (cause) {
                          setApplyError(cause instanceof Error ? cause.message : "保存失败，请重试。");
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      {busy === "generate" ? <Loader2 size={14} className="animate-spin" /> : <WandSparkles size={14} />}
                      应用并保存
                    </Button>
                  </div>
                </div>
                {applyError ? (
                  <div className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 p-2.5 text-[12px] leading-4 text-red-700">
                    <XCircle size={14} className="mt-0.5 shrink-0" /> 保存失败：{applyError}
                  </div>
                ) : null}
              </>
            )}

            <div className="max-h-72 overflow-auto rounded-md border border-line bg-white">
              <table className="w-full border-collapse text-[11px]">
                <thead className="sticky top-0 z-10 bg-neutral-100 text-muted">
                  <tr>
                    <th className="border-b border-r border-line px-2 py-1.5 text-left font-semibold">寄存器地址</th>
                    <th className="border-b border-r border-line px-2 py-1.5 text-left font-semibold">点位名称</th>
                    <th className="border-b border-line px-2 py-1.5 text-left font-semibold">解析方式</th>
                  </tr>
                </thead>
                <tbody>
                  {result.points.map((point) => (
                    <tr key={point.address} className="bg-white">
                      <td className="border-b border-r border-line px-2 py-1 font-mono">{point.address}</td>
                      <td className="border-b border-r border-line px-2 py-1">{point.name}</td>
                      <td className="border-b border-line px-2 py-1 font-mono">{point.mode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.skipped.length ? (
              <div className="space-y-1">
                {result.skipped.map((line) => (
                  <div key={line} className="flex items-start gap-1.5 text-[11px] text-amber-700">
                    <span className="mt-0.5">⚠</span> {line}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
