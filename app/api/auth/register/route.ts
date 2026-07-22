import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { registerUser, makeToken, SESSION_COOKIE } from "@/src/lib/auth";
import { isValidEmail } from "@/src/lib/validation";

/** POST /api/auth/register — { name, email, password } → account + session. */
export async function POST(req: Request) {
  try {
    const { name, email, password } = (await req.json()) as {
      name?: string;
      email?: string;
      password?: string;
    };

    if (!name || !name.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    if (!email || !isValidEmail(email))
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    if (!password || password.length < 8)
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

    const result = await registerUser(name, email, password);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });

    const store = await cookies();
    store.set(SESSION_COOKIE, makeToken(result.user.id), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.json({ user: result.user });
  } catch (err) {
    console.error("[/api/auth/register]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
