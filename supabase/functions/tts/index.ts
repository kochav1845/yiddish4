import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RUNPOD_BASE = "https://api.runpod.ai/v2/5e4qz9p7usxg5e";
const POLL_INTERVAL_MS = 2000;
const MAX_WAIT_MS = 120_000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const RUNPOD_API_KEY = Deno.env.get("RUNPOD_API_KEY");

    if (!RUNPOD_API_KEY) {
      return new Response(
        JSON.stringify({ error: "TTS service not configured. RUNPOD_API_KEY missing." }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const text: string = (body.text ?? "").trim();
    const speakerId: number = Number(body.speaker_id ?? 0);

    if (!text) {
      return new Response(
        JSON.stringify({ error: "text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Submit job to RunPod
    const submitRes = await fetch(`${RUNPOD_BASE}/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RUNPOD_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: { text, speaker_id: speakerId } }),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      return new Response(
        JSON.stringify({ error: `RunPod submit failed: ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const submitData = await submitRes.json();

    // Synchronous response — RunPod returned audio immediately
    if (submitData.output?.audio_b64) {
      return new Response(
        JSON.stringify({ audio_b64: submitData.output.audio_b64, format: "wav" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const jobId: string = submitData.id;
    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "No job ID returned from RunPod", detail: JSON.stringify(submitData) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Poll for completion
    const statusUrl = `${RUNPOD_BASE}/status/${jobId}`;
    const started = Date.now();

    while (Date.now() - started < MAX_WAIT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Bearer ${RUNPOD_API_KEY}` },
      });

      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();

      if (statusData.status === "COMPLETED") {
        const audio_b64 = statusData.output?.audio_b64;
        if (!audio_b64) {
          return new Response(
            JSON.stringify({ error: "Job completed but no audio returned" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ audio_b64, format: "wav" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (statusData.status === "FAILED" || statusData.status === "CANCELLED") {
        return new Response(
          JSON.stringify({ error: statusData.error ?? "TTS job failed" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "TTS timed out after 2 minutes" }),
      { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("TTS error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
