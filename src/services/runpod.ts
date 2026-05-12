const RUNPOD_URL = (import.meta.env.VITE_RUNPOD_URL as string | undefined) || "https://api.runpod.ai/v2/c5y5e4hr3v3496";
const RUNPOD_API_KEY = import.meta.env.VITE_RUNPOD_API_KEY as string | undefined;
const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export function isDirectRunPodConfigured(): boolean {
  return Boolean(RUNPOD_API_KEY);
}

export type WorkerStatus = "checking" | "online" | "cold" | "offline" | "unknown";

export interface WorkerHealth {
  status: WorkerStatus;
  readyWorkers: number;
  runningWorkers: number;
  initializingWorkers: number;
}

export async function checkWorkerHealth(): Promise<WorkerHealth> {
  try {
    const res = await fetch(`${EDGE_URL}?health`, {
      headers: { "Authorization": `Bearer ${ANON_KEY}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { status: "offline", readyWorkers: 0, runningWorkers: 0, initializingWorkers: 0 };
    }

    const data = await res.json();
    const status: WorkerStatus = data?.status ?? "unknown";
    const ready: number = data?.readyWorkers ?? 0;
    const running: number = data?.runningWorkers ?? 0;
    const initializing: number = data?.initializingWorkers ?? 0;

    return { status, readyWorkers: ready, runningWorkers: running, initializingWorkers: initializing };
  } catch {
    return { status: "offline", readyWorkers: 0, runningWorkers: 0, initializingWorkers: 0 };
  }
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const chunk = 8192;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export async function submitDirectToRunPod(file: File): Promise<string> {
  if (!RUNPOD_URL || !RUNPOD_API_KEY) {
    throw new Error("RunPod direct access not configured (missing VITE_RUNPOD_URL or VITE_RUNPOD_API_KEY)");
  }

  const b64 = await fileToBase64(file);

  const res = await fetch(`${RUNPOD_URL}/run`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RUNPOD_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: {
        audio: b64,
        filename: file.name || "audio.wav",
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`RunPod direct submit error ${res.status}: ${errText.substring(0, 200)}`);
  }

  const data = await res.json();
  const jobId = data?.id;

  if (!jobId) {
    throw new Error("RunPod did not return a job id");
  }

  return jobId;
}

export async function pollDirectRunPodStatus(
  jobId: string,
  onProgress?: (elapsed: number) => void
): Promise<string> {
  if (!RUNPOD_URL || !RUNPOD_API_KEY) {
    throw new Error("RunPod direct access not configured");
  }

  const maxWait = 300_000;
  const pollInterval = 3_000;
  const started = Date.now();

  while (Date.now() - started < maxWait) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const res = await fetch(`${RUNPOD_URL}/status/${jobId}`, {
      headers: { "Authorization": `Bearer ${RUNPOD_API_KEY}` },
    });

    if (!res.ok) {
      throw new Error(`RunPod status error ${res.status}`);
    }

    const data = await res.json();
    const status = data?.status ?? "IN_QUEUE";

    if (onProgress) {
      onProgress(Math.round((Date.now() - started) / 1000));
    }

    if (status === "COMPLETED") {
      const output = data?.output ?? {};
      if (output?.error) throw new Error(`RunPod handler error: ${output.error}`);
      return output?.transcription ?? "";
    }

    if (status === "FAILED" || status === "CANCELLED") {
      throw new Error(`RunPod job ${status.toLowerCase()}`);
    }
  }

  throw new Error("RunPod transcription timed out after 5 minutes");
}
