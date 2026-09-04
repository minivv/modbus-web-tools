import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-admin";
import { getAuthedUserId } from "@/lib/server-auth";
import { sameOrigin } from "@/lib/template-validation";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin writes are not allowed." }, { status: 403 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const userId = await getAuthedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid template id." }, { status: 400 });
  }

  // 只能删除属于自己的模板
  const { error } = await supabase.from("modbus_register_presets").delete().eq("id", id).eq("user_id", userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
