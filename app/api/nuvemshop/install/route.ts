import { NextResponse } from "next/server";

import { buildInstallUrl } from "@/src/lib/nuvemshop/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.redirect(buildInstallUrl());
  } catch {
    return NextResponse.json({ error: "Unable to start Nuvemshop installation." }, { status: 500 });
  }
}
