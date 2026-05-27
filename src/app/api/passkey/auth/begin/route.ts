import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";

const RPID = process.env.WEBAUTHN_RP_ID ?? "localhost";

/**
 * Returns WebAuthn authentication options.
 * allowCredentials is empty so the browser shows ALL passkeys for this
 * domain and lets the user pick (Conditional UI / discoverable credentials).
 */
export async function POST() {
  const options = await generateAuthenticationOptions({
    rpID: RPID,
    userVerification: "preferred",
    allowCredentials: [],
  });

  const res = NextResponse.json(options);
  res.cookies.set("_pkc", options.challenge, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 300,
    path: "/",
  });
  return res;
}
