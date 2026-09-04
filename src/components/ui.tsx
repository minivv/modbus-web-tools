"use client";

import { Check, Copy } from "lucide-react";
import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { bytesHex } from "@/lib/hex";
import type { FrameSegment } from "@/lib/types";

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className = "",
  bodyClassName = "",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`flex min-h-0 flex-col rounded-lg border border-line bg-paper shadow-sm ${className}`}>
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold tracking-tight">{title}</h2>
          {subtitle ? <p className="mt-0.5 truncate text-[11px] leading-4 text-muted">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{actions}</div>
      </header>
      <div className={`min-h-0 flex-1 p-3 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`grid gap-1 text-[11px] font-medium text-muted ${className}`}>
      <span>{label}</span>
      {children}
      {hint ? <span className="font-normal text-[10px] leading-4 text-muted">{hint}</span> : null}
    </label>
  );
}

export function FormRow({
  label,
  hint,
  children,
  className = "",
  align = "center",
  labelWidth = 92,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  align?: "center" | "start";
  labelWidth?: number;
}) {
  return (
    <div
      className={`grid gap-2 ${align === "start" ? "items-start" : "items-center"} ${className}`}
      style={{ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)` }}
    >
      <span className={`text-[11px] font-medium text-muted ${align === "start" ? "pt-1.5" : "text-right"}`}>{label}</span>
      <div className="min-w-0">
        {children}
        {hint ? <div className="mt-1 text-[10px] leading-3 text-muted">{hint}</div> : null}
      </div>
    </div>
  );
}

const controlClass =
  "h-8 w-full rounded-md border border-line bg-white px-2 text-[13px] text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-amber-200";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border border-line bg-white px-2 py-1.5 font-mono text-[13px] leading-5 outline-none transition focus:border-accent focus:ring-2 focus:ring-amber-200 ${props.className ?? ""}`}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-foreground text-white hover:bg-neutral-800",
    secondary: "border border-line bg-white text-foreground hover:bg-neutral-50",
    ghost: "text-muted hover:bg-neutral-100 hover:text-foreground",
    danger: "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-45 ${styles} ${className}`}
    />
  );
}

export function StatusBadge({
  tone,
  children,
}: {
  tone: "ok" | "warning" | "error" | "neutral";
  children: ReactNode;
}) {
  const styles = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    error: "border-red-200 bg-red-50 text-red-700",
    neutral: "border-line bg-neutral-50 text-muted",
  }[tone];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${styles}`}>{children}</span>;
}

export function CopyButton({ value, label = "复制" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? "已复制" : label}
    </Button>
  );
}

export function HexBlock({ title, bytes, actions }: { title: string; bytes: Uint8Array | number[]; actions?: ReactNode }) {
  const value = bytesHex(bytes);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-muted">{title}</span>
        <div className="flex gap-2">
          {actions}
          <CopyButton value={value} />
        </div>
      </div>
      <pre className="max-h-40 overflow-auto rounded-md border border-line bg-neutral-50 p-3 font-mono text-sm leading-6 text-foreground">
        {value}
      </pre>
    </div>
  );
}

const segmentStyles: Record<FrameSegment["kind"], string> = {
  transport: "border-neutral-300 bg-neutral-100 text-neutral-700",
  address: "border-blue-200 bg-blue-50 text-blue-800",
  function: "border-indigo-200 bg-indigo-50 text-indigo-800",
  addressRange: "border-teal-200 bg-teal-50 text-teal-800",
  quantity: "border-amber-200 bg-amber-50 text-amber-800",
  byteCount: "border-orange-200 bg-orange-50 text-orange-800",
  data: "border-emerald-200 bg-emerald-50 text-emerald-800",
  checksum: "border-pink-200 bg-pink-50 text-pink-800",
  exception: "border-red-200 bg-red-50 text-red-700",
  value: "border-violet-200 bg-violet-50 text-violet-800",
};

export function AnnotatedFrame({ segments }: { segments: FrameSegment[] }) {
  if (!segments.length) return null;
  return (
    <div className="flex w-max max-w-full gap-2 overflow-x-auto pb-1">
      {segments.map((item) => (
        <div key={item.id} className={`min-w-24 shrink-0 rounded-md border px-3 py-2 ${segmentStyles[item.kind]}`}>
          <div className="text-[11px] font-semibold">{item.label}</div>
          <div className="mt-1 whitespace-nowrap font-mono text-sm">{bytesHex(item.bytes)}</div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center rounded-md border border-dashed border-line bg-neutral-50 p-6 text-center">
      <p className="text-sm font-semibold text-muted">{title}</p>
      {description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}
    </div>
  );
}
