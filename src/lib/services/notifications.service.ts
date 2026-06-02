/**
 * Server-side push notification helpers.
 * Uses the admin client + web-push directly so server actions can call them
 * without doing an HTTP round-trip to themselves (which breaks on serverless
 * because redirect() terminates the process before the fetch completes).
 */
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

function initWebPush() {
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

async function sendToUsers(userIds: string[], payload: string) {
  if (!initWebPush()) return; // VAPID not configured — skip silently

  const admin = createAdminClient();

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (!subs || subs.length === 0) return;

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  // Clean up expired subscriptions (410 Gone)
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
}

// ─── Public helpers ───────────────────────────────────────────────────────────

export async function notifyExpenseAdded({
  expenseId,
  groupId,
  paidBy,
  description,
  amount,
}: {
  expenseId: string;
  groupId: string;
  paidBy: string;
  description: string;
  amount: number;
}): Promise<void> {
  try {
    const admin = createAdminClient();

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

    if (!members || members.length === 0) return;

    const payerName = payer?.display_name ?? "Alguien";
    const groupName = group?.name ?? "SpendLab";
    const formatted = new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency: "CLP",
      maximumFractionDigits: 0,
    }).format(amount);

    const payload = JSON.stringify({
      title: groupName,
      body: `${payerName} añadió "${description}" por ${formatted}`,
      url: `/activity/${expenseId}`,
    });

    await sendToUsers(
      members.map((m) => m.user_id),
      payload
    );
  } catch (err) {
    // Never block the main flow — notifications are best-effort
    console.error("[notifyExpenseAdded]", err);
  }
}

export async function notifyGroupInvitation({
  groupId,
  invitedEmail,
}: {
  groupId: string;
  invitedEmail: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    const [{ data: group }, { data: profile }] = await Promise.all([
      admin.from("groups").select("name").eq("id", groupId).single(),
      admin.from("profiles").select("id").eq("email", invitedEmail).maybeSingle(),
    ]);

    if (!profile) return; // user not registered yet

    const payload = JSON.stringify({
      title: "SpendLab",
      body: `Te invitaron a unirse a "${group?.name ?? "un grupo"}"`,
      url: "/groups",
    });

    await sendToUsers([profile.id], payload);
  } catch (err) {
    console.error("[notifyGroupInvitation]", err);
  }
}
