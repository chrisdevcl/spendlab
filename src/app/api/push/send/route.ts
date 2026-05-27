/**
 * POST /api/push/send
 *
 * Called by a Supabase Database Webhook on group_invitations INSERT.
 * Looks up the push subscription for the invited_email and sends a
 * Web Push notification.
 *
 * Required env vars:
 *   PUSH_WEBHOOK_SECRET   — shared secret to authenticate the webhook call
 *   VAPID_SUBJECT         — mailto:you@yourapp.com
 *   VAPID_PUBLIC_KEY      — generated with `npx web-push generate-vapid-keys`
 *   VAPID_PRIVATE_KEY     — idem
 */
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const WEBHOOK_SECRET = process.env.PUSH_WEBHOOK_SECRET;

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
}

export async function POST(request: NextRequest) {
  // Verify webhook secret
  if (WEBHOOK_SECRET) {
    const secret = request.headers.get("x-webhook-secret");
    if (secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json();

  // Supabase Database Webhooks send the new row in body.record
  const record = body.record ?? body;
  const invitedEmail: string | undefined = record.invited_email;
  const groupId: string | undefined = record.group_id;

  if (!invitedEmail || !groupId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get group name
  const { data: group } = await admin
    .from("groups")
    .select("name")
    .eq("id", groupId)
    .single();

  // Get inviter name + recipient user_id
  const { data: profile } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("email", invitedEmail)
    .single();

  if (!profile) {
    // User not registered yet — nothing to push
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Look up the user's push subscriptions
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", profile.id);

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const payload = JSON.stringify({
    title: "SpendLab",
    body: `Te invitaron a unirse a "${group?.name ?? "un grupo"}"`,
    url: "/groups",
  });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  // Remove expired/invalid subscriptions (410 Gone)
  const expiredEndpoints = subs
    .filter((_, i) => {
      const r = results[i];
      return (
        r.status === "rejected" &&
        (r.reason as { statusCode?: number })?.statusCode === 410
      );
    })
    .map((s) => s.endpoint);

  if (expiredEndpoints.length > 0) {
    await admin
      .from("push_subscriptions")
      .delete()
      .in("endpoint", expiredEndpoints);
  }

  return NextResponse.json({ ok: true });
}
