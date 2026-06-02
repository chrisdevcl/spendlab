/**
 * POST /api/push/test
 *
 * Sends a test push notification to the current user's own subscriptions.
 * Returns per-subscription results (status + push-service status code) so the
 * UI can show exactly what happened on the full round-trip.
 */
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

function initWebPush(): boolean {
  if (
    process.env.VAPID_SUBJECT &&
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY
  ) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    return true;
  }
  return false;
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!initWebPush()) {
    return NextResponse.json(
      { error: "VAPID no configurado en el servidor" },
      { status: 500 }
    );
  }

  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user.id);

  if (!subs || subs.length === 0) {
    return NextResponse.json(
      { error: "No tienes suscripciones guardadas. Activa las notificaciones primero." },
      { status: 400 }
    );
  }

  const payload = JSON.stringify({
    title: "SpendLab",
    body: "🔔 Notificación de prueba — ¡funciona!",
    url: "/profile",
  });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  const detail = results.map((r, i) => {
    const endpoint = subs[i].endpoint;
    const host = (() => {
      try { return new URL(endpoint).host; } catch { return "?"; }
    })();
    if (r.status === "fulfilled") {
      return { host, ok: true, statusCode: r.value.statusCode };
    }
    const reason = r.reason as { statusCode?: number; body?: string; message?: string };
    return {
      host,
      ok: false,
      statusCode: reason?.statusCode,
      message: reason?.body || reason?.message || String(r.reason),
    };
  });

  const sent = detail.filter((d) => d.ok).length;
  console.log("[push:test] user:", user.id, "sent:", sent, "of", subs.length, "detail:", detail);

  return NextResponse.json({ ok: sent > 0, sent, total: subs.length, detail });
}
