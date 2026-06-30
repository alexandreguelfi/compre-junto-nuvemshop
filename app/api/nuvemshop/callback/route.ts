import { NextRequest, NextResponse } from "next/server";

import { COMPRE_JUNTO_PLAN } from "@/src/lib/billing/commercial-status";
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

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
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
    const trialStartedAt = new Date();
    const trialEndsAt = addDays(trialStartedAt, COMPRE_JUNTO_PLAN.trialDays);
    const savedStore = await prisma.store.upsert({
      where: {
        nuvemshopStoreId: token.storeId,
      },
      create: {
        nuvemshopStoreId: token.storeId,
        accessTokenCiphertext,
        commercialStatus: "TRIALING",
        disconnectedAt: null,
        scopes: token.scopes,
        trialEndsAt,
        trialStartedAt,
      },
      update: {
        accessTokenCiphertext,
        disconnectedAt: null,
        scopes: token.scopes,
      },
      select: {
        commercialStatus: true,
        id: true,
        nuvemshopStoreId: true,
        trialEndsAt: true,
        trialStartedAt: true,
        updatedAt: true,
      },
    });
    const existingTrialStartedAt = savedStore.trialStartedAt ?? trialStartedAt;

    if (!savedStore.trialStartedAt || !savedStore.trialEndsAt) {
      await prisma.store.update({
        where: {
          id: savedStore.id,
        },
        data: {
          trialEndsAt: savedStore.trialEndsAt ?? addDays(existingTrialStartedAt, COMPRE_JUNTO_PLAN.trialDays),
          trialStartedAt: existingTrialStartedAt,
        },
      });
    }

    logSafeCallbackDiagnostic("store_upsert_success", {
      storeId: savedStore.id,
      providerStoreId: savedStore.nuvemshopStoreId,
      commercialStatus: savedStore.commercialStatus,
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
