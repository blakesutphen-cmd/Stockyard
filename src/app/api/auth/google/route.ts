import { NextResponse } from "next/server";
import { consentUrl } from "@/lib/google/auth";

export const runtime = "nodejs";

// Kick off the OAuth consent flow. In V1 this is only ever hit by you; put your
// Supabase magic-link auth check in front of it before shipping.
export async function GET() {
  return NextResponse.redirect(consentUrl());
}
