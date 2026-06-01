/**
 * POST /api/push/send
 *
 * Called by a Supabase Database Webhook on group_invitations INSERT.
 * Sends a Web Push notification to the invited user.
 *
 * Required env vars:
 *   PUSH_WEBHOOK_SECRET   — shared secret to authenticate the webhook call
 *   VAPID_SUBJECT / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
 */
import { notifyGroupInvitation } from "@/lib/services/notifications.service";
import { NextRequest, NextResponse } from "next/server";

const WEBHOOK_SECRET = process.env.PUSH_WEBHOOK_SECRET;

export async function POST(request: NextRequest) {
  if (WEBHOOK_SECRET) {
    const secret = request.headers.get("x-webhook-secret");
    if (secret !== WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await request.json();
  const record = body.record ?? body;
  const invitedEmail: string | undefined = record.invited_email;
  const groupId: string | undefined      = record.group_id;

  if (!invitedEmail || !groupId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  await notifyGroupInvitation({ groupId, invitedEmail });
  return NextResponse.json({ ok: true });
}
