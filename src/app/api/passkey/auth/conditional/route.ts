import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { NextResponse } from "next/server";

const RPID = process.env.WEBAUTHN_RP_ID ?? "localhost";

/**
 * Generates a discoverable-credential challenge for Passkey Conditional UI.
 *
 * Called on page load (no email required). The browser uses this challenge to
 * show registered passkeys in the email field's autocomplete dropdown, so
 * password managers like 1Password or iCloud Keychain can offer passkey login
 * without the user pressing any button.
 *
 * The frontend pairs this with startAuthentication({ useBrowserAutofill: true })
 * and autocomplete="username webauthn" on the email input.
 */
export async function GET() {
  const options = await generateAuthenticationOptions({
    rpID: RPID,
    userVerification: "preferred",
    // No allowCredentials → discoverable credentials: browser finds all
    // passkeys registered for this RP and surfaces them in the autofill UI.
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
