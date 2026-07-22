import { NextResponse } from "next/server";
import { getSessionUser } from "@/src/lib/auth";

/** GET /api/auth/me — current user, or 401 when signed out. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "not authenticated" }, { status: 401 });
  return NextResponse.json({ user });
}
