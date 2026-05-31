import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
} from "@simplewebauthn/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

type AuthenticatorTransportFuture =
  | "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";

const RPID = process.env.WEBAUTHN_RP_ID ?? "localhost";

/**
 * Returns WebAuthn options and a `mode` field:
 *
 *   mode: "authenticate" — user has passkeys → browser shows sign-in prompt
 *   mode: "register"     — no passkeys found → browser shows "create passkey" prompt
 *                          (works for both brand-new users and existing users
 *                           who never set up a passkey)
 *
 * The frontend calls startAuthentication or startRegistration accordingly,
 * then posts to /api/passkey/auth/finish (authenticate) or
 * /api/passkey/auth/setup (register + create account + session).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email: string | undefined = body.email?.toString().trim().toLowerCase();

  if (!email) {
    return NextResponse.json({ error: "El correo es requerido." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Check if this email has any registered passkeys
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  let creds: { credential_id: string; transports: string[] | null }[] = [];
  if (profile) {
    const { data } = await admin
      .from("passkey_credentials")
      .select("credential_id, transports")
      .eq("user_id", profile.id);
    creds = data ?? [];
  }

  const hasPasskeys = creds.length > 0;

  // ── AUTHENTICATE: user already has passkeys ──────────────────────────────
  if (hasPasskeys && profile) {
    const allowCredentials = creds.map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
    }));

    const options = await generateAuthenticationOptions({
      rpID: RPID,
      userVerification: "preferred",
      allowCredentials,
    });

    const res = NextResponse.json({ mode: "authenticate", ...options });
    res.cookies.set("_pkc", options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 300,
      path: "/",
    });
    return res;
  }

  // ── EXISTING USER WITHOUT PASSKEYS: must use magic link ──────────────────
  // Allowing passkey registration here would let anyone claim an existing
  // account just by knowing its email address.
  if (profile) {
    return NextResponse.json(
      { error: "Esta cuenta no tiene passkeys. Usa el enlace mágico para ingresar." },
      { status: 403 }
    );
  }

  // ── REGISTER: brand-new user only ────────────────────────────────────────
  // Use email bytes as userID so it's deterministic across calls.
  const userID = new TextEncoder().encode(email);

  const options = await generateRegistrationOptions({
    rpName: "SpendLab",
    rpID: RPID,
    userName: email,
    userDisplayName: email.split("@")[0],
    userID,
    attestationType: "none",
    excludeCredentials: [],
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
  });

  const res = NextResponse.json({ mode: "register", ...options });
  res.cookies.set("_pkc", options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 300,
    path: "/",
  });
  // Store email server-side so the setup handler knows who to register
  res.cookies.set("_pke", email, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 300,
    path: "/",
  });
  return res;
}
