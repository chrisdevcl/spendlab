import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

function safeKeyInfo(key: string | undefined, label: string) {
  if (!key) {
    console.error(`[push:debug] ${label} is MISSING`);
    return { set: false, length: null, prefix: null, suffix: null, hasWhitespace: null };
  }
  const trimmed = key.trim();
  const hasWhitespace = key !== trimmed;
  const info = {
    set: true,
    length: key.length,
    trimmedLength: trimmed.length,
    hasWhitespace,
    prefix: key.substring(0, 6),
    suffix: key.substring(key.length - 4),
  };
  console.log(`[push:debug] ${label}:`, info);
  return info;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const serverPublicKey  = process.env.VAPID_PUBLIC_KEY;
  const serverPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const serverSubject    = process.env.VAPID_SUBJECT;
  const clientPublicKey  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const serverPubInfo  = safeKeyInfo(serverPublicKey,  "VAPID_PUBLIC_KEY (server)");
  const clientPubInfo  = safeKeyInfo(clientPublicKey,  "NEXT_PUBLIC_VAPID_PUBLIC_KEY (client)");
  const privateKeyInfo = safeKeyInfo(serverPrivateKey, "VAPID_PRIVATE_KEY (server)");

  const keysMatch = !!serverPublicKey && !!clientPublicKey &&
    serverPublicKey.trim() === clientPublicKey.trim();

  console.log("[push:debug] Keys match:", keysMatch);
  console.log("[push:debug] VAPID_SUBJECT:", serverSubject);

  // Validate key format (should decode to 65 bytes, first byte 0x04)
  let keyDecodeInfo: { length?: number; firstByte?: number; valid?: boolean; error?: string } = {};
  if (serverPublicKey) {
    try {
      const key = serverPublicKey.trim();
      const padding = "=".repeat((4 - (key.length % 4)) % 4);
      const base64 = (key + padding).replace(/-/g, "+").replace(/_/g, "/");
      const raw = atob(base64);
      keyDecodeInfo = {
        length: raw.length,
        firstByte: raw.charCodeAt(0),
        valid: raw.length === 65 && raw.charCodeAt(0) === 4,
      };
      console.log("[push:debug] Key decode:", keyDecodeInfo);
    } catch (e) {
      keyDecodeInfo = { error: String(e) };
      console.error("[push:debug] Key decode FAILED:", e);
    }
  }

  // Count existing subscriptions for this user
  const { count } = await supabase
    .from("push_subscriptions")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  console.log("[push:debug] Subscriptions in DB for user:", count);

  return NextResponse.json({
    userId: user.id,
    serverPublicKey: serverPubInfo,
    clientPublicKey: clientPubInfo,
    privateKey: { set: privateKeyInfo.set, length: privateKeyInfo.length },
    subject: serverSubject ?? null,
    keysMatch,
    keyDecodeInfo,
    subscriptionsInDb: count ?? 0,
  });
}
