import { getSupabaseAdmin } from "@/lib/supabase-admin";

/** 从请求 Authorization: Bearer <jwt> 解析当前登录用户 id；未登录/无效返回 null */
export async function getAuthedUserId(request: Request): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}
