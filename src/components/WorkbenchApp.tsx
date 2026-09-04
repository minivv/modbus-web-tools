"use client";

import { BookOpen, Info, MessageSquareCode, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import About from "@/components/About";
import CommandBuilder from "@/components/CommandBuilder";
import ProtocolReference from "@/components/ProtocolReference";
import ResponseParser, { type ExampleKind, type ParserState } from "@/components/ResponseParser";
import { TemplateStatus } from "@/components/TemplatePanel";
import { buildCommand } from "@/lib/codec";
import type {
  BuiltFrame,
  CommandInput,
  ParseResult,
  ParserWorkerRequest,
  ParserWorkerResponse,
  RegisterDisplayPreset as Template,
} from "@/lib/types";

type Section = "builder" | "parser" | "reference" | "about";

const SECTIONS: { id: Section; title: string; subtitle: string; icon: typeof Wrench }[] = [
  { id: "builder", title: "构建请求", subtitle: "RTU / TCP ADU 与 PDU", icon: Wrench },
  { id: "parser", title: "解析响应", subtitle: "多帧、寄存器与模板", icon: MessageSquareCode },
  { id: "reference", title: "协议参考", subtitle: "功能码、限制与字节序", icon: BookOpen },
  { id: "about", title: "关于", subtitle: "性能与部署说明", icon: Info },
];

const DEFAULT_COMMAND: CommandInput = {
  transport: "rtu",
  transactionId: 1,
  unitId: 1,
  functionCode: 3,
  startAddress: 0,
  quantity: 10,
  singleValue: 1,
  valuesText: "",
};

const DEFAULT_PARSER: ParserState = {
  text: "01 03 04 00 2A 42 48 EB 6D",
  transport: "rtu",
  displayMode: "UINT16",
  assumedStartAddress: 0,
  expectedCountText: "2",
  registerDisplayOverrides: {},
  pointNames: {},
};

const LOCAL_TEMPLATES_KEY = "modbus-web-tools.templates";

export default function WorkbenchApp() {
  const [section, setSection] = useState<Section>("builder");
  const [command, setCommand] = useState<CommandInput>(DEFAULT_COMMAND);
  const [parserState, setParserState] = useState<ParserState>(DEFAULT_PARSER);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(0);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateStatus, setTemplateStatus] = useState<TemplateStatus>("loading");
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  const built = useMemo<{ frame: BuiltFrame | null; error: string | null }>(() => {
    try {
      return { frame: buildCommand(command), error: null };
    } catch (error) {
      return { frame: null, error: error instanceof Error ? error.message : "构建失败。" };
    }
  }, [command]);

  const activeTemplate = useMemo(
    () => templates.find((template) => template.id === activeTemplateId) ?? null,
    [activeTemplateId, templates],
  );

  useEffect(() => {
    const worker = new Worker(new URL("../workers/parser.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<ParserWorkerResponse>) => {
      const message = event.data;
      if (message.type === "parse") {
        setResult(message.result);
        setParsing(false);
        setSelectedFrameIndex(0);
      } else if (message.type === "rows") {
        setResult((current) =>
          current
            ? {
                ...current,
                registerRows: message.rows,
                stats: { ...current.stats, durationMs: message.durationMs },
              }
            : current,
        );
      }
    };

    worker.onerror = () => {
      setParsing(false);
      setResult({
        ok: false,
        error: "Worker 解析失败，请刷新页面重试。",
        frames: [],
        registerRows: [],
        stats: {
          inputLength: 0,
          lineCount: 0,
          byteCount: 0,
          frameCount: 0,
          crcErrors: 0,
          lengthErrors: 0,
          exceptions: 0,
          warnings: 0,
          durationMs: 0,
        },
      });
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const sendParseRequest = useCallback((state: ParserState) => {
    const worker = workerRef.current;
    if (!worker) return;
    const expectedCount = Number.parseInt(state.expectedCountText.trim(), 10);
    const request: ParserWorkerRequest = {
      type: "parse",
      text: state.text,
      transport: state.transport,
      displayMode: state.displayMode,
      assumedStartAddress: state.assumedStartAddress,
      expectedCount: Number.isInteger(expectedCount) && expectedCount >= 0 ? expectedCount : undefined,
      registerDisplayOverrides: state.registerDisplayOverrides,
    };
    setParsing(true);
    worker.postMessage(request);
  }, []);

  const parseKey = JSON.stringify([
    parserState.text,
    parserState.transport,
    parserState.displayMode,
    parserState.assumedStartAddress,
    parserState.expectedCountText,
    parserState.registerDisplayOverrides,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => sendParseRequest(parserState), 120);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parseKey, sendParseRequest]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const worker = workerRef.current;
      if (!worker || !result?.ok) return;
      worker.postMessage({
        type: "rows",
        displayMode: parserState.displayMode,
        assumedStartAddress: parserState.assumedStartAddress,
        registerDisplayOverrides: parserState.registerDisplayOverrides,
      });
    }, 80);
    return () => clearTimeout(timer);
  }, [parserState.displayMode, parserState.assumedStartAddress, parserState.registerDisplayOverrides, result?.ok]);

  const loadLocalTemplates = useCallback(() => {
    try {
      const raw = window.localStorage.getItem(LOCAL_TEMPLATES_KEY);
      const parsed = raw ? (JSON.parse(raw) as Template[]) : [];
      setTemplates(parsed.slice(0, 24));
      setTemplateStatus("local");
    } catch {
      setTemplates([]);
      setTemplateStatus("error");
    }
  }, []);

  const refreshTemplates = useCallback(async () => {
    setTemplateStatus("loading");
    setTemplateError(null);
    try {
      const response = await fetch("/api/templates", { cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as { templates: Template[] };
      setTemplates(data.templates);
      setTemplateStatus("cloud");
    } catch {
      loadLocalTemplates();
      setTemplateError("云端模板不可用，已切换到浏览器本地缓存。");
    }
  }, [loadLocalTemplates]);

  useEffect(() => {
    void refreshTemplates();
  }, [refreshTemplates]);

  const saveLocalTemplate = useCallback((template: Template) => {
    const next = [template, ...templates.filter((item) => item.name !== template.name)].slice(0, 24);
    setTemplates(next);
    window.localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(next));
  }, [templates]);

  const saveTemplate = useCallback(
    async (rawName: string) => {
      if (!result?.registerRows.length) return;
      const name = rawName.trim().slice(0, 40) || activeTemplate?.name || "解析方式";
      const first = result.registerRows[0];
      const last = result.registerRows.at(-1);
      const pointCount = last ? last.address + last.span - first.address : 0;
      const visibleAddresses = new Set(result.registerRows.map((row) => row.address));
      const overrides = Object.fromEntries(
        Object.entries(parserState.registerDisplayOverrides).filter(
          ([address, mode]) => visibleAddresses.has(Number(address)) && mode !== parserState.displayMode,
        ),
      );
      const pointNames = Object.fromEntries(
        Object.entries(parserState.pointNames).filter(([address, pointName]) => {
          const name = pointName.trim().slice(0, 40);
          return visibleAddresses.has(Number(address)) && Boolean(name);
        }),
      );
      const now = new Date().toISOString();
      const payload = {
        name,
        startAddress: parserState.assumedStartAddress,
        pointCount,
        defaultMode: parserState.displayMode,
        overrides,
        pointNames,
      };

      setTemplateSaving(true);
      setTemplateError(null);
      try {
        const response = await fetch("/api/templates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(await response.text());
        const saved = (await response.json().catch(() => null)) as { template?: Template } | null;
        if (saved?.template) setActiveTemplateId(saved.template.id);
        await refreshTemplates();
      } catch {
        const localTemplate: Template = {
          id: activeTemplate?.id ?? crypto.randomUUID(),
          createdAt: activeTemplate?.createdAt ?? now,
          updatedAt: now,
          ...payload,
        };
        saveLocalTemplate(localTemplate);
        setActiveTemplateId(localTemplate.id);
        setTemplateStatus("local");
        setTemplateError("云端保存失败，已保存到浏览器本地缓存。");
      } finally {
        setTemplateSaving(false);
      }
    },
    [activeTemplate, parserState, refreshTemplates, result, saveLocalTemplate],
  );

  const deleteTemplate = useCallback(
    async (template: Template) => {
      setTemplateError(null);
      if (template.id === activeTemplateId) setActiveTemplateId(null);
      if (templateStatus === "cloud") {
        const response = await fetch(`/api/templates/${template.id}`, { method: "DELETE" });
        if (!response.ok) {
          setTemplateError("云端删除失败。");
          return;
        }
        await refreshTemplates();
        return;
      }

      const next = templates.filter((item) => item.id !== template.id);
      setTemplates(next);
      window.localStorage.setItem(LOCAL_TEMPLATES_KEY, JSON.stringify(next));
    },
    [activeTemplateId, refreshTemplates, templateStatus, templates],
  );

  const updateParserState = useCallback((patch: Partial<ParserState>) => {
    setParserState((current) => ({ ...current, ...patch }));
  }, []);

  const setRegisterMode = useCallback((address: number, mode: Template["defaultMode"]) => {
    setParserState((current) => {
      const key = String(address);
      const overrides = { ...current.registerDisplayOverrides };
      if (mode === current.displayMode) delete overrides[key];
      else overrides[key] = mode;
      return { ...current, registerDisplayOverrides: overrides };
    });
  }, []);

  const setPointName = useCallback((address: number, name: string) => {
    setParserState((current) => {
      const pointNames = { ...current.pointNames };
      const key = String(address);
      const trimmed = name.trim().slice(0, 40);
      if (trimmed) pointNames[key] = trimmed;
      else delete pointNames[key];
      return { ...current, pointNames };
    });
  }, []);

  const applyTemplate = useCallback((template: Template) => {
    setActiveTemplateId(template.id);
    setParserState((current) => ({
      ...current,
      assumedStartAddress: template.startAddress,
      displayMode: template.defaultMode,
      registerDisplayOverrides: template.overrides,
      pointNames: template.pointNames,
    }));
  }, []);

  const applyGeneratedTemplate = useCallback(
    async (payload: Pick<Template, "name" | "startAddress" | "pointCount" | "defaultMode" | "overrides" | "pointNames">) => {
      setTemplateError(null);
      const now = new Date().toISOString();
      let savedTemplate: Template | null = null;
      try {
        const response = await fetch("/api/templates", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!response.ok) throw new Error(await response.text());
        const saved = (await response.json().catch(() => null)) as { template?: Template } | null;
        savedTemplate = saved?.template ?? null;
        await refreshTemplates();
      } catch {
        const localTemplate: Template = {
          id: crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          ...payload,
        };
        saveLocalTemplate(localTemplate);
        savedTemplate = localTemplate;
        setTemplateStatus("local");
        setTemplateError("云端保存失败，已保存到浏览器本地缓存。");
      }
      if (savedTemplate) setActiveTemplateId(savedTemplate.id);
      applyTemplate({
        ...payload,
        id: savedTemplate?.id ?? crypto.randomUUID(),
        createdAt: savedTemplate?.createdAt ?? now,
        updatedAt: savedTemplate?.updatedAt ?? now,
      });
    },
    [applyTemplate, refreshTemplates, saveLocalTemplate],
  );

  const loadExample = useCallback((kind: ExampleKind) => {
    const examples: Record<ExampleKind, ParserState> = {
      register: {
        ...DEFAULT_PARSER,
        text: "01 03 04 00 2A 42 48 EB 6D",
        displayMode: "UINT16",
        expectedCountText: "2",
      },
      float: {
        ...DEFAULT_PARSER,
        text: "01 03 04 42 48 00 00 6E 5D",
        displayMode: "FLOAT_ABCD",
        expectedCountText: "2",
      },
      coil: {
        ...DEFAULT_PARSER,
        text: "01 01 02 CD 01 2C AC",
        displayMode: "UINT16",
        expectedCountText: "10",
      },
      exception: {
        ...DEFAULT_PARSER,
        text: "00 01 00 00 00 03 01 83 02",
        transport: "tcp",
        displayMode: "UINT16",
        expectedCountText: "",
      },
    };
    setParserState(examples[kind]);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="hidden w-56 shrink-0 border-r border-line bg-paper lg:block">
        <div className="border-b border-line px-4 py-4">
          <p className="text-base font-semibold tracking-tight">Modbus Web Tools</p>
          <p className="mt-1 text-xs text-muted">离线报文工作台</p>
        </div>
        <nav className="space-y-1 p-2">
          {SECTIONS.map(({ id, title, subtitle, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setSection(id)}
              className={`flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition ${
                section === id ? "bg-amber-100 text-amber-900" : "text-foreground hover:bg-neutral-100"
              }`}
            >
              <Icon size={17} className="mt-0.5" />
              <span>
                <span className="block text-[13px] font-medium">{title}</span>
                <span className="block text-[11px] text-muted">{subtitle}</span>
              </span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="scroll-shell min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex gap-2 overflow-x-auto lg:hidden">
            {SECTIONS.map(({ id, title }) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${
                  section === id ? "bg-amber-100 text-amber-900" : "bg-neutral-100 text-muted"
                }`}
              >
                {title}
              </button>
            ))}
          </div>
          {section === "builder" ? (
            <CommandBuilder command={command} built={built.frame} error={built.error} onChange={setCommand} />
          ) : null}
          {section === "parser" ? (
            <ResponseParser
              state={parserState}
              result={result}
              parsing={parsing}
              selectedFrameIndex={selectedFrameIndex}
              templates={templates}
              templateStatus={templateStatus}
              templateSaving={templateSaving}
              templateError={templateError}
              activeTemplate={activeTemplate}
              onStateChange={updateParserState}
              onRegisterModeChange={setRegisterMode}
              onPointNameChange={setPointName}
              onParse={() => sendParseRequest(parserState)}
              onFrameSelect={setSelectedFrameIndex}
              onLoadExample={loadExample}
              onSaveTemplate={saveTemplate}
              onApplyTemplate={applyTemplate}
              onDeleteTemplate={deleteTemplate}
              onRefreshTemplates={refreshTemplates}
              onAiTemplateApply={applyGeneratedTemplate}
            />
          ) : null}
          {section === "reference" ? <ProtocolReference /> : null}
          {section === "about" ? <About /> : null}
        </div>
      </main>
    </div>
  );
}
