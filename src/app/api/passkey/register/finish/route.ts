import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const RPID = process.env.WEBAUTHN_RP_ID ?? "localhost";

function getOrigin() {
  const url = process.env.NEXT_PUBLIC_APP_URL;
  if (url) return url;
  return "http://localhost:3741";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const challenge = request.cookies.get("_pkc")?.value;
  if (!challenge) {
    return NextResponse.json(
      { error: "Challenge expirado. Intenta de nuevo." },
      { status: 400 }
    );
  }

  const body = await request.json();

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: challenge,
      expectedOrigin: getOrigin(),
      expectedRPID: RPID,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json(
      { error: "Verificación fallida" },
      { status: 400 }
    );
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  const { error: dbErr } = await supabase
    .from("passkey_credentials")
    .insert({
      user_id: user.id,
      credential_id: credential.id,
      public_key: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      device_type: credentialDeviceType,
      backed_up: credentialBackedUp,
      transports: body.response?.transports ?? [],
      nickname:   null,
    });

  if (dbErr) {
    console.error("passkey register db error:", dbErr);
    return NextResponse.json(
      { error: "Error al guardar passkey" },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ verified: true });
  res.cookies.delete("_pkc");
  return res;
}
