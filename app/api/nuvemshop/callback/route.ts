import { NextRequest, NextResponse } from "next/server";

import { StoreStatus } from "@/lib/generated/prisma/client";
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

function getSafeCallbackError(error: unknown): string {
  if (error instanceof NuvemshopAuthError) {
    return error.message;
  }

  return "Unexpected Nuvemshop callback error.";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  if (!code) {
    return jsonError("Missing Nuvemshop authorization code.", 400);
  }

  if (state && !validateInstallState(state)) {
    return jsonError("Invalid Nuvemshop installation state.", 400);
  }

  try {
    const token = await exchangeCodeForToken(code);
    const installedAt = new Date();

    await prisma.store.upsert({
      where: {
        nuvemshopStoreId: token.storeId,
      },
      create: {
        nuvemshopStoreId: token.storeId,
        accessTokenCiphertext: encryptAccessTokenForStorage(token.accessToken),
        scopes: token.scopes,
        status: StoreStatus.CONNECTED,
        installedAt,
        disconnectedAt: null,
      },
      update: {
        accessTokenCiphertext: encryptAccessTokenForStorage(token.accessToken),
        scopes: token.scopes,
        status: StoreStatus.CONNECTED,
        installedAt,
        disconnectedAt: null,
      },
    });

    return NextResponse.redirect(new URL("/admin", getEnv().NUVEMSHOP_APP_URL));
  } catch (error) {
    console.warn("Nuvemshop OAuth callback failed.", {
      reason: getSafeCallbackError(error),
      state: state ? "present" : "missing",
    });

    return jsonError("Unable to finish Nuvemshop installation.", 502);
  }
}
