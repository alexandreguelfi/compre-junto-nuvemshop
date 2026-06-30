import { NextRequest, NextResponse } from "next/server";

import { getEnv } from "@/src/lib/env";
import {
  encryptAccessTokenForStorage,
  exchangeCodeForToken,
  NuvemshopAuthError,
  validateInstallState,
} from "@/src/lib/nuvemshop/auth";
import { prisma } from "@/src/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getSafeAuthErrorDetails(error: unknown): Record<string, string | number | boolean | null> {
  if (error instanceof NuvemshopAuthError) {
    return {
      reason: error.message,
      ...error.safeDetails,
    };
  }

  return {
    reason: "Unexpected Nuvemshop callback error.",
  };
}

function logSafeCallbackFailure(stage: string, details: Record<string, string | number | boolean | null> = {}) {
  console.warn("Nuvemshop OAuth callback failed.", {
    stage,
    ...details,
  });
}

function logSafeCallbackDiagnostic(stage: string, details: Record<string, string | number | boolean | null> = {}) {
  console.info("Nuvemshop OAuth callback diagnostic.", {
    stage,
    ...details,
  });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code) {
    logSafeCallbackFailure("missing_code", {
      state: state ? "present" : "missing",
    });

    return jsonError("Missing Nuvemshop authorization code.", 400);
  }

  if (state && !validateInstallState(state)) {
    logSafeCallbackFailure("invalid_state", {
      state: "present",
    });

    return jsonError("Invalid Nuvemshop installation state.", 400);
  }

  const token = await exchangeCodeForToken(code).catch((error: unknown) => {
    logSafeCallbackFailure("token_exchange", {
      state: state ? "present" : "missing",
      ...getSafeAuthErrorDetails(error),
    });

    return null;
  });

  if (!token) {
    return jsonError("Unable to exchange Nuvemshop authorization code.", 502);
  }

  const accessTokenCiphertext = (() => {
    try {
      return encryptAccessTokenForStorage(token.accessToken);
    } catch {
      logSafeCallbackFailure("token_encryption", {
        storeId: token.storeId,
      });

      return null;
    }
  })();

  if (!accessTokenCiphertext) {
    return jsonError("Unable to secure Nuvemshop access token.", 500);
  }

  try {
    const savedStore = await prisma.store.upsert({
      where: {
        nuvemshopStoreId: token.storeId,
      },
      create: {
        nuvemshopStoreId: token.storeId,
        accessTokenCiphertext,
        disconnectedAt: null,
        scopes: token.scopes,
      },
      update: {
        accessTokenCiphertext,
        disconnectedAt: null,
        scopes: token.scopes,
      },
      select: {
        id: true,
        nuvemshopStoreId: true,
        updatedAt: true,
      },
    });

    logSafeCallbackDiagnostic("store_upsert_success", {
      storeId: savedStore.id,
      providerStoreId: savedStore.nuvemshopStoreId,
      updatedAt: savedStore.updatedAt.toISOString(),
      hasAccessToken: true,
      scopesCount: token.scopes.length,
    });
  } catch (error) {
    logSafeCallbackFailure("store_upsert", {
      storeId: token.storeId,
      hasAccessToken: true,
      scopesCount: token.scopes.length,
      ...getSafeAuthErrorDetails(error),
    });

    return jsonError("Unable to save Nuvemshop store installation.", 500);
  }

  try {
    return NextResponse.redirect(new URL("/admin", getEnv().NUVEMSHOP_APP_URL));
  } catch {
    logSafeCallbackFailure("redirect", {
      storeId: token.storeId,
    });

    return jsonError("Nuvemshop installation saved, but redirect failed.", 500);
  }
}
