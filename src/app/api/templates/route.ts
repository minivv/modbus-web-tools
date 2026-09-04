import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-admin";
import { getAuthedUserId } from "@/lib/server-auth";
import { MAX_PRESET_COUNT, mapPresetRow, parsePresetInput, sameOrigin } from "@/lib/template-validation";

export const dynamic = "force-dynamic";

function baseTemplatesQuery(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, userId: string) {
  return supabase
    .from("modbus_register_presets")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MAX_PRESET_COUNT);
}

export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const userId = await getAuthedUserId(request);
  if (!userId) {
    // 未登录：不返回任何云端模板，前端显示本机缓存
    return NextResponse.json({ templates: [], authed: false });
  }

  const { data, error } = await baseTemplatesQuery(supabase, userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates: (data ?? []).map(mapPresetRow), authed: true });
}

export async function POST(request: Request) {
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
    return NextResponse.json({ error: "请先登录后再保存模板。" }, { status: 401 });
  }

  const input = parsePresetInput(await request.json().catch(() => null));
  if (!input) {
    return NextResponse.json({ error: "Invalid template payload." }, { status: 400 });
  }

  const existingResult = await supabase
    .from("modbus_register_presets")
    .select("id, created_at")
    .eq("user_id", userId)
    .eq("name", input.name)
    .maybeSingle();

  if (existingResult.error) {
    return NextResponse.json({ error: existingResult.error.message }, { status: 500 });
  }

  const row = {
    user_id: userId,
    name: input.name,
    start_address: input.startAddress,
    point_count: input.pointCount,
    default_mode: input.defaultMode,
    overrides: input.overrides,
    point_names: input.pointNames,
    updated_at: new Date().toISOString(),
  };

  const result = existingResult.data
    ? await supabase
        .from("modbus_register_presets")
        .update({ ...row, created_at: existingResult.data.created_at })
        .eq("id", existingResult.data.id)
        .eq("user_id", userId)
        .select("*")
        .single()
    : await supabase
        .from("modbus_register_presets")
        .insert(row)
        .select("*")
        .single();

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const all = await supabase
    .from("modbus_register_presets")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (all.error) {
    return NextResponse.json({ error: all.error.message }, { status: 500 });
  }
  if ((all.data ?? []).length > MAX_PRESET_COUNT) {
    const idsToDelete = (all.data ?? []).slice(MAX_PRESET_COUNT).map((item) => item.id);
    if (idsToDelete.length) {
      await supabase.from("modbus_register_presets").delete().in("id", idsToDelete);
    }
  }

  return NextResponse.json({ template: mapPresetRow(result.data as Record<string, unknown>) }, { status: existingResult.data ? 200 : 201 });
}
