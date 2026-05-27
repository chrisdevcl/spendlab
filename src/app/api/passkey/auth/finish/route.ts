import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

type AuthenticatorTransportFuture =
  | "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";

const RPID = process.env.WEBAUTHN_RP_ID ?? "localhost";

function getOrigin() {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) return url;
  return "http://localhost:3741";
}

export async function POST(request: NextRequest) {
  const challenge = request.cookies.get("_pkc")?.value;
  if (!challenge) {
    return NextResponse.json(
      { error: "Challenge expirado. Intenta de nuevo." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const credentialId: string = body.id;

  // Look up the stored credential + owner profile (bypass RLS via admin client)
  const admin = createAdminClient();
  const { data: storedCred } = await admin
    .from("passkey_credentials")
    .select("*, profiles!inner(id, email)")
    .eq("credential_id", credentialId)
    .single();

  if (!storedCred) {
    return NextResponse.json({ error: "Passkey no encontrada" }, { status: 404 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: getOrigin(),
      expectedRPID: RPID,
      credential: {
        id: storedCred.credential_id,
        publicKey: isoBase64URL.toBuffer(storedCred.public_key),
        counter: storedCred.counter,
        transports: (storedCred.transports ??
          []) as AuthenticatorTransportFuture[],
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Verificación fallida" }, { status: 400 });
  }

  // Update the counter to prevent replay attacks
  await admin
    .from("passkey_credentials")
    .update({ counter: verification.authenticationInfo.newCounter })
    .eq("credential_id", credentialId);

  // Create a Supabase session for the user by generating a magic-link token
  // (admin.generateLink does NOT send an email — we use the token directly)
  const userEmail = (storedCred.profiles as unknown as { email: string }).email;
  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email: userEmail,
      options: {
        redirectTo: `${getOrigin()}/auth/callback`,
        shouldCreateUser: false,
      } as Parameters<typeof admin.auth.admin.generateLink>[0]["options"],
    });

  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error("generateLink error:", linkErr);
    return NextResponse.json({ error: "Error al crear sesión" }, { status: 500 });
  }

  const res = NextResponse.json({
    token: linkData.properties.hashed_token,
    email: userEmail,
  });
  res.cookies.delete("_pkc");
  return res;
}
