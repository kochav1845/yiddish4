import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonRes(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const podUrl = Deno.env.get("TTS_POD_URL")?.replace(/\/$/, "");

    if (!podUrl) {
      return jsonRes({ error: "TTS service not configured. TTS_POD_URL secret is missing." }, 503);
    }

    const url = new URL(req.url);

    // Health check — proxy to pod /health
    if (req.method === "GET" && url.searchParams.has("health")) {
      const res = await fetch(`${podUrl}/health`, {
        signal: AbortSignal.timeout(8000),
      });
      const data = await res.json();
      return jsonRes(data, res.status);
    }

    if (req.method !== "POST") {
      return jsonRes({ error: "Method not allowed" }, 405);
    }

    const body = await req.json();
    const text: string = (body.text ?? "").trim();
    const speakerId: number = Number(body.speaker_id ?? 0);

    if (!text) {
      return jsonRes({ error: "text is required" }, 400);
    }

    // Call pod directly — single request, no polling
    const res = await fetch(`${podUrl}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, speaker_id: speakerId }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[TTS] Pod error ${res.status}: ${errText.substring(0, 300)}`);
      return jsonRes({ error: `TTS pod error ${res.status}: ${errText.substring(0, 200)}` }, 502);
    }

    const data = await res.json();

    if (data.error) {
      return jsonRes({ error: data.error }, 500);
    }

    return jsonRes({ audio_b64: data.audio_b64, format: data.format ?? "wav" });
  } catch (err) {
    console.error("[TTS] Unhandled:", err);
    return jsonRes(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      500,
    );
  }
});
