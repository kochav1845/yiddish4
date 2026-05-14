import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonRes(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripNikud(text: string): string {
  return text.replace(/[\u0591-\u05C7]/g, "");
}

function toBase64(bytes: Uint8Array): string {
  const chunk = 8192;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function handleSubmit(req: Request): Promise<Response> {
  const form = await req.formData();
  const audioFile = form.get("audio") as File | null;
  const inputLang = (form.get("input_language") as string) || "yiddish";
  const outputLang = (form.get("output_language") as string) || "yiddish";

  if (!audioFile) {
    return jsonRes({ error: "No audio file provided" }, 400);
  }

  console.log(`[SUBMIT] ${audioFile.name}, ${audioFile.size} bytes, ${inputLang} -> ${outputLang}`);

  if (inputLang === "yiddish") {
    const runpodUrl = "https://api.runpod.ai/v2/c5y5e4hr3v3496";
    const runpodApiKey = Deno.env.get("RUNPOD_API_KEY");
    if (!runpodApiKey) return jsonRes({ error: "RunPod API key not configured" }, 500);

    const buf = await audioFile.arrayBuffer();
    const b64 = toBase64(new Uint8Array(buf));

    // Derive a filename with a reliable extension.
    // If the original name has no extension, fall back to a MIME-based guess
    // so the RunPod server can pick the right ffmpeg conversion path.
    const MIME_TO_EXT: Record<string, string> = {
      "audio/webm":       "audio.webm",
      "audio/ogg":        "audio.ogg",
      "audio/mpeg":       "audio.mp3",
      "audio/mp4":        "audio.m4a",
      "audio/x-m4a":     "audio.m4a",
      "audio/wav":        "audio.wav",
      "audio/flac":       "audio.flac",
      "audio/x-flac":     "audio.flac",
    };
    const hasExt = /\.\w{2,5}$/.test(audioFile.name);
    const safeFilename = hasExt
      ? audioFile.name
      : (MIME_TO_EXT[audioFile.type] ?? "audio.webm");

    const res = await fetch(`${runpodUrl}/run`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${runpodApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          audio: b64,
          filename: safeFilename,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[SUBMIT] RunPod error: ${errText.substring(0, 300)}`);
      return jsonRes({ error: `RunPod error ${res.status}` }, 502);
    }

    const result = await res.json();
    const jobId = result?.id;

    if (!jobId) {
      console.error(`[SUBMIT] RunPod did not return job id: ${JSON.stringify(result).substring(0, 200)}`);
      return jsonRes({ error: "RunPod did not return a job id" }, 502);
    }

    console.log(`[SUBMIT] RunPod job queued: ${jobId}`);
    return jsonRes({ status: "IN_QUEUE", jobId, inputLang, outputLang, provider: "runpod" });

  } else {
    const gKey = Deno.env.get("GEMINI_API_KEY");
    if (!gKey) return jsonRes({ error: "Gemini not configured" }, 500);

    const buf = await audioFile.arrayBuffer();
    const b64 = toBase64(new Uint8Array(buf));
    const mime = audioFile.type || "audio/webm";
    const langLabel = inputLang === "english" ? "English" : "Hebrew";

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${gKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { inline_data: { mime_type: mime, data: b64 } },
                {
                  text: `Transcribe this audio. The spoken language is ${langLabel}. Return ONLY the transcribed text, nothing else. No labels, no prefixes, no explanations. Do NOT include any nikud (Hebrew vowel diacritics/points).`,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[SUBMIT] Gemini error: ${errText.substring(0, 300)}`);
      return jsonRes({ error: `Gemini error ${res.status}` }, 502);
    }

    const result = await res.json();
    const rawText = result?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    console.log(`[SUBMIT] Gemini done: ${rawText.length} chars`);

    return jsonRes({
      status: "COMPLETED",
      rawText: stripNikud(rawText),
      inputLang,
      outputLang,
      provider: "gemini",
    });
  }
}

async function handleHealthCheck(): Promise<Response> {
  const runpodUrl = "https://api.runpod.ai/v2/c5y5e4hr3v3496";
  const runpodApiKey = Deno.env.get("RUNPOD_API_KEY");
  if (!runpodApiKey) return jsonRes({ status: "unknown", error: "RunPod not configured" });

  try {
    const res = await fetch(`${runpodUrl}/health`, {
      headers: { "Authorization": `Bearer ${runpodApiKey}` },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return jsonRes({ status: "offline" });

    const data = await res.json();
    const workers = data?.workers ?? {};
    const ready: number = workers.ready ?? 0;
    const running: number = workers.running ?? 0;
    const initializing: number = workers.initializing ?? 0;

    const status = (ready > 0 || running > 0) ? "online" : "cold";
    return jsonRes({ status, readyWorkers: ready, runningWorkers: running, initializingWorkers: initializing });
  } catch {
    return jsonRes({ status: "offline" });
  }
}

async function handleStatusCheck(jobId: string): Promise<Response> {
  const runpodUrl = "https://api.runpod.ai/v2/c5y5e4hr3v3496";
  const runpodApiKey = Deno.env.get("RUNPOD_API_KEY");
  if (!runpodApiKey) return jsonRes({ error: "RunPod not configured" }, 500);

  const res = await fetch(`${runpodUrl}/status/${jobId}`, {
    headers: { "Authorization": `Bearer ${runpodApiKey}` },
  });

  if (!res.ok) {
    console.error(`[STATUS] RunPod status error: ${res.status}`);
    return jsonRes({ error: `RunPod status error ${res.status}` }, 502);
  }

  const result = await res.json();
  const status = result?.status ?? "IN_QUEUE";

  console.log(`[STATUS] Job ${jobId}: ${status}`);

  if (status === "COMPLETED") {
    const output = result?.output ?? {};
    if (output?.error) {
      return jsonRes({ status: "FAILED", error: output.error }, 502);
    }
    const rawText = stripNikud(output?.transcription ?? "");
    const rawTextIvrit = output?.transcription_ivrit != null
      ? stripNikud(output.transcription_ivrit as string)
      : null;
    return jsonRes({ status: "COMPLETED", rawText, rawTextIvrit });
  }

  if (status === "FAILED" || status === "CANCELLED") {
    return jsonRes({ status, error: result?.error ?? "Job failed" }, 502);
  }

  return jsonRes({ status });
}

async function handleProcess(req: Request): Promise<Response> {
  const body = await req.json();
  const { rawText, inputLang, outputLang } = body as {
    rawText: string;
    inputLang: string;
    outputLang: string;
  };

  if (!rawText?.trim()) {
    return jsonRes({ transcription: "", raw_transcription: "" });
  }

  const aKey = Deno.env.get("ANTHROPIC_API_KEY");
  let finalText = rawText;

  if (aKey) {
    if (inputLang === "yiddish" || inputLang === "hebrew") {
      console.log(`[PROCESS] Grammar fix (${inputLang})...`);
      finalText = await callClaude(finalText, grammarSystem(inputLang), aKey);
    }

    if (inputLang !== outputLang) {
      console.log(`[PROCESS] Translate ${inputLang} -> ${outputLang}...`);
      finalText = await callClaude(finalText, translateSystem(inputLang, outputLang), aKey);

      if (outputLang === "yiddish" || outputLang === "hebrew") {
        console.log(`[PROCESS] Post-translate grammar (${outputLang})...`);
        finalText = await callClaude(finalText, grammarSystem(outputLang), aKey);
      }
    }
  }

  finalText = stripNikud(finalText);
  const cleanRaw = stripNikud(rawText);

  console.log(`[PROCESS] Done: ${finalText.length} chars`);
  return jsonRes({
    transcription: finalText,
    raw_transcription: cleanRaw,
    input_language: inputLang,
    output_language: outputLang,
  });
}

async function callClaude(
  prompt: string,
  system: string,
  apiKey: string
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[CLAUDE] Error ${res.status}: ${errText.substring(0, 300)}`);
    throw new Error(`Claude error ${res.status}`);
  }

  const result = await res.json();
  return result?.content?.[0]?.text?.trim() ?? "";
}

function grammarSystem(lang: string): string {
  const name = lang === "yiddish" ? "Yiddish" : "Hebrew";
  return `You are an expert ${name} language editor. Correct grammar, spelling, and punctuation errors. Keep the meaning intact. Return ONLY the corrected text. No explanations. Do NOT include any nikud.`;
}

function translateSystem(from: string, to: string): string {
  const names: Record<string, string> = {
    yiddish: "Yiddish",
    english: "English",
    hebrew: "Hebrew",
  };
  return `You are a professional translator. Translate from ${names[from]} to ${names[to]}. Return ONLY the translated text. No explanations, no labels. Maintain tone and meaning. Do NOT include any nikud.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const jobId = url.searchParams.get("jobId");
      const health = url.searchParams.get("health");
      if (health !== null) return await handleHealthCheck();
      if (!jobId) return jsonRes({ error: "Missing jobId parameter" }, 400);
      return await handleStatusCheck(jobId);
    }

    if (req.method === "POST") {
      const contentType = req.headers.get("content-type") ?? "";

      if (contentType.includes("application/json")) {
        return await handleProcess(req);
      }

      if (contentType.includes("multipart/form-data")) {
        return await handleSubmit(req);
      }
    }

    return jsonRes({ error: "Invalid request" }, 400);
  } catch (err) {
    console.error("[EDGE] Unhandled:", err);
    return jsonRes(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      500
    );
  }
});
