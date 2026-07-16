export const NUVEMSHOP_TOKEN_URL = "https://www.tiendanube.com/apps/authorize/token";

export function buildTokenExchangeRequest(
  code: string,
  credentials: { clientId: string; clientSecret: string },
): RequestInit {
  return {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: "authorization_code",
      code,
    }),
    cache: "no-store",
  };
}
