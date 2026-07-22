import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { loginUser, makeToken, SESSION_COOKIE } from "@/src/lib/auth";
import { isValidEmail } from "@/src/lib/validation";

/** POST /api/auth/login — { email, password } → session cookie. */
export async function POST(req: Request) {
  try {
    const { email, password } = (await req.json()) as { email?: string; password?: string };
    if (!email || !isValidEmail(email))
      return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
    if (!password) return NextResponse.json({ error: "Password is required" }, { status: 400 });

    const result = await loginUser(email, password);
    if (!result.ok)
      return NextResponse.json({ error: result.error, needsRegister: result.needsRegister ?? false }, { status: 401 });

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
    console.error("[/api/auth/login]", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
