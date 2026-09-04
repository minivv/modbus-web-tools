"use client";

import { Loader2, LogIn, Mail, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { Button, TextInput } from "@/components/ui";
import type { AuthResult } from "@/lib/use-auth";

export default function AuthModal({
  onClose,
  onSignIn,
  onSignUp,
}: {
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<AuthResult>;
  onSignUp: (email: string, password: string) => Promise<AuthResult>;
}) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    if (!email.trim() || password.length < 6) {
      setNotice({ ok: false, text: "请输入邮箱，密码至少 6 位。" });
      return;
    }
    setBusy(true);
    setNotice(null);
    const result = mode === "signin" ? await onSignIn(email, password) : await onSignUp(email, password);
    setBusy(false);
    setNotice({ ok: result.ok, text: result.message });
    if (result.ok && (mode === "signin" || (mode === "signup" && result.message === "注册成功。"))) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-white/95 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="my-10 w-full max-w-sm space-y-4 rounded-xl border border-line bg-paper p-5 shadow-sm"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="mt-0.5 text-amber-600" />
            <div>
              <h3 className="text-sm font-semibold tracking-tight">{mode === "signin" ? "登录" : "注册账号"}</h3>
              <p className="mt-0.5 text-[11px] text-muted">解析模板将保存到你的账号</p>
            </div>
          </div>
          <Button variant="ghost" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="block text-[12px] font-medium text-muted">
            <span className="mb-1 flex items-center gap-1"><Mail size={12} /> 邮箱</span>
            <TextInput
              type="email"
              value={email}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block text-[12px] font-medium text-muted">
            <span className="mb-1">密码</span>
            <TextInput
              type="password"
              value={password}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              placeholder="至少 6 位"
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !busy) void submit();
              }}
            />
          </label>
        </div>

        {notice ? (
          <div
            className={`rounded-md border p-2.5 text-[12px] leading-4 ${
              notice.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {notice.text}
          </div>
        ) : null}

        <div className="space-y-2">
          <Button variant="primary" className="w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <LogIn size={14} />}
            {mode === "signin" ? "登录" : "注册并登录"}
          </Button>
          <button
            type="button"
            className="w-full text-center text-[12px] text-muted underline-offset-2 hover:underline"
            onClick={() => {
              setMode((current) => (current === "signin" ? "signup" : "signin"));
              setNotice(null);
            }}
          >
            {mode === "signin" ? "还没有账号？注册一个（默认开放）" : "已有账号？返回登录"}
          </button>
        </div>
      </div>
    </div>
  );
}
