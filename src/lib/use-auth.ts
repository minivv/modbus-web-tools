"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthResult {
  ok: boolean;
  message: string;
}

export interface UseAuth {
  configured: boolean;
  loading: boolean;
  user: AuthUser | null;
  token: string | null;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuth {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [configured] = useState(() => Boolean(supabase));
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
      if (mounted) setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  const user = session?.user
    ? { id: session.user.id, email: session.user.email ?? session.user.phone ?? "已登录用户" }
    : null;

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) return { ok: false, message: "账号系统未配置。" };
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return { ok: false, message: error.message };
      return { ok: true, message: "登录成功。" };
    },
    [supabase],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      if (!supabase) return { ok: false, message: "账号系统未配置。" };
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) {
        const message =
          error.message === "Auth API is disabled for this project."
            ? "该项目未开放邮箱注册，请在 Supabase Auth 设置中开启。"
            : error.message;
        return { ok: false, message };
      }
      if (!data.session) {
        return {
          ok: true,
          message: "注册成功，请前往邮箱点击确认链接后登录。",
        };
      }
      return { ok: true, message: "注册成功。" };
    },
    [supabase],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, [supabase]);

  return { configured, loading, user, token: session?.access_token ?? null, signIn, signUp, signOut };
}
