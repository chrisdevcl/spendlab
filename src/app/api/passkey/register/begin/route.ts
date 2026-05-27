import { generateRegistrationOptions } from "@simplewebauthn/server";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// AuthenticatorTransportFuture mirrors the spec enum
type AuthenticatorTransportFuture =
  | "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";

const RPID = process.env.WEBAUTHN_RP_ID ?? "localhost";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Exclude already-registered credentials so the browser won't re-register them
  const { data: existing } = await supabase
    .from("passkey_credentials")
    .select("credential_id, transports")
    .eq("user_id", user.id);

  const options = await generateRegistrationOptions({
    rpName: "SpendLab",
    rpID: RPID,
    userName: user.email ?? user.id,
    userDisplayName: user.email ?? user.id,
    attestationType: "none",
    excludeCredentials: (existing ?? []).map((c) => ({
      id: c.credential_id,
      transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
      authenticatorAttachment: "platform",
    },
  });

  const res = NextResponse.json(options);
  // Store challenge in httpOnly cookie — stateless, works on serverless
  res.cookies.set("_pkc", options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 300,
    path: "/",
  });
  return res;
}
