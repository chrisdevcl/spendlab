/**
 * POST /api/push/expense
 *
 * Called from the createExpense server action after a new expense is created.
 * Sends a Web Push notification to all group members except the payer.
 *
 * Body: { expenseId, groupId, paidBy, description, amount }
 */
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

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
  const body = await request.json();
  const { groupId, paidBy, description, amount } = body as {
    groupId?: string;
    paidBy?: string;
    description?: string;
    amount?: number;
  };

  if (!groupId || !paidBy || !description || amount == null) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch group name and payer display name in parallel
  const [{ data: group }, { data: payer }, { data: members }] =
    await Promise.all([
      admin.from("groups").select("name").eq("id", groupId).single(),
      admin.from("profiles").select("display_name").eq("id", paidBy).single(),
      admin
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId)
        .neq("user_id", paidBy),
    ]);

  if (!members || members.length === 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const memberIds = members.map((m) => m.user_id);

  // Get push subscriptions for all other members
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", memberIds);

  if (!subs || subs.length === 0) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const payerName = payer?.display_name ?? "Alguien";
  const groupName = group?.name ?? "el grupo";
  const formattedAmount = new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(amount);

  const payload = JSON.stringify({
    title: groupName,
    body: `${payerName} añadió "${description}" por ${formattedAmount}`,
    url: `/groups/${groupId}`,
  });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
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
