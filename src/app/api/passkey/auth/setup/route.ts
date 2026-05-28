import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const RPID = process.env.WEBAUTHN_RP_ID ?? "localhost";

function getOrigin() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3741";
}

/**
 * Called after a successful startRegistration() when mode === "register".
 * Handles three cases in one flow:
 *   1. Brand-new user   → create Supabase account + save passkey + create session
 *   2. Existing account → skip account creation + save passkey + create session
 *   3. Duplicate device → existing credential for this device, return clear error
 */
export async function POST(request: NextRequest) {
  const challenge = request.cookies.get("_pkc")?.value;
  const email     = request.cookies.get("_pke")?.value;

  if (!challenge || !email) {
    return NextResponse.json(
      { error: "Sesión expirada. Intenta de nuevo." },
      { status: 400 }
    );
  }

  const body = await request.json();

  // 1. Verify the registration response (challenge + origin + rpID)
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
    return NextResponse.json({ error: "Verificación fallida" }, { status: 400 });
  }

  const admin = createAdminClient();

  // 2. Get or create the Supabase user ─────────────────────────────────────
  let userId: string;

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existingProfile) {
    // User already has an account (just no passkeys yet)
    userId = existingProfile.id;
  } else {
    // Brand-new user: create account and auto-confirm email
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (createErr || !newUser.user) {
      console.error("createUser error:", createErr);
      return NextResponse.json({ error: "Error al crear cuenta." }, { status: 500 });
    }

    userId = newUser.user.id;

    // Trigger creates the profile automatically, but upsert as safety net
    // in case the trigger hasn't fired yet in the same transaction.
    await admin
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          display_name: email.split("@")[0],
        },
        { onConflict: "id", ignoreDuplicates: true }
      );
  }

  // 3. Save the passkey credential ─────────────────────────────────────────
  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  const { error: dbErr } = await admin
    .from("passkey_credentials")
    .insert({
      user_id:     userId,
      credential_id: credential.id,
      public_key:  isoBase64URL.fromBuffer(credential.publicKey),
      counter:     credential.counter,
      device_type: credentialDeviceType,
      backed_up:   credentialBackedUp,
      transports:  body.response?.transports ?? [],
    });

  if (dbErr) {
    // unique constraint on credential_id → device already registered
    if (dbErr.code === "23505") {
      return NextResponse.json(
        { error: "Este dispositivo ya tiene una passkey registrada para esta cuenta." },
        { status: 409 }
      );
    }
    console.error("passkey setup db error:", dbErr);
    return NextResponse.json({ error: "Error al guardar passkey." }, { status: 500 });
  }

  // 4. Create a Supabase session (same pattern as auth/finish) ──────────────
  const { data: linkData, error: linkErr } =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo: `${getOrigin()}/auth/callback`,
        shouldCreateUser: false,
      } as Parameters<typeof admin.auth.admin.generateLink>[0]["options"],
    });

  if (linkErr || !linkData?.properties?.hashed_token) {
    console.error("generateLink error:", linkErr);
    return NextResponse.json({ error: "Error al crear sesión." }, { status: 500 });
  }

  const res = NextResponse.json({ token: linkData.properties.hashed_token });
  res.cookies.delete("_pkc");
  res.cookies.delete("_pke");
  return res;
}
