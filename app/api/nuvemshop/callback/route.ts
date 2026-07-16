import { NextRequest, NextResponse } from "next/server";

import { getBillingPlanConfig } from "@/src/lib/billing/commercial-status";
import { getEnv } from "@/src/lib/env";
import {
  encryptAccessTokenForStorage,
  exchangeCodeForToken,
  NuvemshopAuthError,
  validateInstallState,
} from "@/src/lib/nuvemshop/auth";
import { handleNuvemshopCallback, upsertNuvemshopInstallation } from "@/src/lib/nuvemshop/callback-flow";
import { prisma } from "@/src/lib/prisma";
import {
  ADMIN_STORE_COOKIE,
  ADMIN_STORE_SESSION_MAX_AGE_SECONDS,
  createAdminStoreSession,
} from "@/src/lib/stores/admin-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  const error = request.nextUrl.searchParams.get("error");
  const state = request.nextUrl.searchParams.get("state");

  return handleNuvemshopCallback(
    {
      code,
      error,
      errorDescriptionPresent: request.nextUrl.searchParams.has("error_description"),
      state,
    },
    {
      createSuccessResponse(providerStoreId) {
        const response = NextResponse.redirect(new URL("/admin", getEnv().NUVEMSHOP_APP_URL));
        response.cookies.set(ADMIN_STORE_COOKIE, createAdminStoreSession(providerStoreId), {
          httpOnly: true,
          maxAge: ADMIN_STORE_SESSION_MAX_AGE_SECONDS,
          path: "/",
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        });

        return response;
      },
      encryptAccessToken: encryptAccessTokenForStorage,
      exchangeCode: exchangeCodeForToken,
      getSafeErrorDetails: getSafeAuthErrorDetails,
      logFailure: logSafeCallbackFailure,
      async saveInstallation(installation) {
        const savedStore = await upsertNuvemshopInstallation(
          {
            update: (args) => prisma.store.update(args),
            upsert: (args) => prisma.store.upsert(args),
          },
          installation,
          getBillingPlanConfig().trialDays,
        );

        logSafeCallbackDiagnostic("store_upsert_success", {
          storeId: savedStore.id,
          providerStoreId: savedStore.nuvemshopStoreId,
          commercialStatus: savedStore.commercialStatus,
          updatedAt: savedStore.updatedAt.toISOString(),
          hasAccessToken: true,
          scopesCount: installation.scopes.length,
        });
      },
      validateState: validateInstallState,
    },
  );
}
