import { createServerFn } from "@tanstack/react-start";

export const askJarvis = createServerFn({ method: "POST" })
  .validator((input: { prompt: string; snapshot: string; name: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "offline" as const };

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 420,
        temperature: 0.6,
        messages: [
          {
            role: "system",
            content:
              "You are JARVIS, operations officer for Cottage Homecare's HHA Pro intake desk. Voice: dry, precise, lightly British, never cute, never emoji. Address the operator by first name when known. You help rank referrals, draft outreach, flag stale cases, and keep the pipeline moving. Stay inside homecare intake — do not invent PHI. Keep answers under 140 words unless asked for a script. If giving a call script, put it in one short paragraph the operator can read aloud.",
          },
          {
            role: "user",
            content: `Operator: ${data.name || "unknown"}\n\nDesk snapshot:\n${data.snapshot.slice(0, 6000)}\n\nRequest: ${data.prompt.slice(0, 800)}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return { ok: false as const, error: `xAI ${res.status}` };
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return { ok: true as const, text: body.choices?.[0]?.message?.content ?? "Standing by." };
  });

export const speakJarvis = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => input)
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "offline" as const };
    const text = data.text.slice(0, 700);
    try {
      const res = await fetch("https://api.x.ai/v1/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ text, voice_id: "eve" }),
      });
      if (!res.ok) return { ok: false as const, error: `tts ${res.status}` };
      const buf = Buffer.from(await res.arrayBuffer());
      return {
        ok: true as const,
        audio: buf.toString("base64"),
        mime: res.headers.get("content-type") || "audio/mpeg",
      };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "tts failed" };
    }
  });
