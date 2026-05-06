import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ADMIN_EMAIL = "a88933513@gmail.com";
const FROM_ADDRESS = "heimishgeredt <noreply@stardev.dev>";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    console.log("[send-email] auth check:", user?.email, authError?.message);

    if (authError || !user || user.email !== ADMIN_EMAIL) {
      console.log("[send-email] unauthorized:", user?.email);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { subject, html, userIds, sendToAll } = body as {
      subject: string;
      html: string;
      userIds?: string[];
      sendToAll?: boolean;
    };

    if (!subject || !html) {
      return new Response(
        JSON.stringify({ error: "subject and html are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let query = supabase.from("profiles").select("id, email");
    if (!sendToAll && userIds && userIds.length > 0) {
      query = query.in("id", userIds);
    }

    const { data: profiles, error: profilesError } = await query;
    if (profilesError) throw profilesError;

    const recipients = (profiles ?? [])
      .map((p: { id: string; email: string | null }) => p.email)
      .filter((e): e is string => !!e && e.length > 0);

    console.log("[send-email] recipients:", recipients.length);

    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ error: "No valid recipient emails found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.log("[send-email] RESEND_API_KEY is missing");
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("[send-email] sending from:", FROM_ADDRESS);

    const results: { email: string; ok: boolean; error?: string }[] = [];

    for (const email of recipients) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [email],
          subject,
          html,
        }),
      });
      const data = await res.json();
      const errMsg = res.ok ? undefined : (data.message ?? data.error ?? JSON.stringify(data));
      console.log("[send-email] →", email, res.status, errMsg ?? "ok");
      results.push({ email, ok: res.ok, error: errMsg });
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);

    // Surface the first Resend error prominently so it's visible in the UI
    const firstError = failed[0]?.error;

    return new Response(
      JSON.stringify({
        sent,
        failed: failed.length,
        total: recipients.length,
        details: failed,
        ...(failed.length > 0 && sent === 0 && firstError ? { error: firstError } : {}),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[send-email] unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
