const BASE_TELEMETRY_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  Vary: "Origin",
} as const;

export type PublicTelemetryCors = {
  allowed: boolean;
  headers: Record<string, string>;
  origin: string | null;
};

function isLocalDevelopmentOrigin(url: URL) {
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")
  );
}

export function resolvePublicTelemetryCors(request: Pick<Request, "headers">): PublicTelemetryCors {
  const origin = request.headers.get("origin")?.trim() || null;
  if (!origin) return { allowed: true, headers: { ...BASE_TELEMETRY_HEADERS }, origin: null };

  try {
    const parsed = new URL(origin);
    const allowed =
      parsed.origin === origin &&
      !parsed.username &&
      !parsed.password &&
      (parsed.protocol === "https:" || isLocalDevelopmentOrigin(parsed));

    return {
      allowed,
      headers: allowed
        ? {
            ...BASE_TELEMETRY_HEADERS,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Origin": origin,
          }
        : { ...BASE_TELEMETRY_HEADERS },
      origin,
    };
  } catch {
    return { allowed: false, headers: { ...BASE_TELEMETRY_HEADERS }, origin };
  }
}
