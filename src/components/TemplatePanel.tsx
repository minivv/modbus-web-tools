"use client";

import { Cloud, CloudOff, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { RegisterDisplayPreset } from "@/lib/types";
import { Button, Select, StatusBadge, TextInput } from "@/components/ui";

export type TemplateStatus = "cloud" | "local" | "loading" | "error";

export default function TemplatePanel({
  templates,
  status,
  saving,
  error,
  suggestedName,
  activeTemplate,
  canSave,
  onSave,
  onApply,
  onDelete,
  onRefresh,
}: {
  templates: RegisterDisplayPreset[];
  status: TemplateStatus;
  saving: boolean;
  error: string | null;
  suggestedName: string;
  activeTemplate: RegisterDisplayPreset | null;
  canSave: boolean;
  onSave: (name: string) => Promise<void> | void;
  onApply: (template: RegisterDisplayPreset) => void;
  onDelete: (template: RegisterDisplayPreset) => Promise<void> | void;
  onRefresh: () => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const saveName = name.trim() || activeTemplate?.name || suggestedName;

  useEffect(() => {
    setName(activeTemplate?.name ?? "");
  }, [activeTemplate?.id, activeTemplate?.name]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {status === "cloud" ? <StatusBadge tone="ok"><Cloud size={13} className="mr-1" />云端</StatusBadge> : null}
        {status === "local" ? <StatusBadge tone="warning"><CloudOff size={13} className="mr-1" />本地缓存</StatusBadge> : null}
        {status === "loading" ? <StatusBadge tone="neutral">加载中</StatusBadge> : null}
        {status === "error" ? <StatusBadge tone="error">连接失败</StatusBadge> : null}

        <Select
          aria-label="已保存解析模板"
          className="!w-[210px]"
          value={activeTemplate ? String(activeTemplate.id) : ""}
          onChange={(event) => {
            const template = templates.find((item) => String(item.id) === event.target.value);
            if (template) onApply(template);
          }}
        >
          <option value="">{templates.length ? "选择模板" : "暂无已保存解析模板"}</option>
          {templates.map((template) => (
            <option key={template.id} value={String(template.id)}>
              {template.name} · {template.pointCount} 点位
            </option>
          ))}
        </Select>

        <TextInput
          aria-label="模板名称"
          className="!w-[180px]"
          value={name}
          placeholder={activeTemplate?.name ?? "新模板名称"}
          onChange={(event) => setName(event.target.value)}
        />

        <Button variant="primary" disabled={!canSave || saving} onClick={() => onSave(saveName)}>
          <Plus size={14} /> {saving ? "保存中" : activeTemplate ? "覆盖当前模板" : "保存为解析模板"}
        </Button>

        <Button variant="secondary" onClick={onRefresh}>
          <RefreshCw size={14} /> 刷新
        </Button>

        <Button
          variant="danger"
          disabled={!activeTemplate}
          onClick={() => {
            if (!activeTemplate) return;
            const confirmed = window.confirm(
              `确定要删除当前模板"${activeTemplate.name}"吗？该操作无法撤销。`,
            );
            if (confirmed) void onDelete(activeTemplate);
          }}
        >
          <Trash2 size={14} /> 删除当前模板
        </Button>
      </div>

      {error ? <div className="text-right text-[11px] leading-4 text-red-600">{error}</div> : null}
    </div>
  );
}
