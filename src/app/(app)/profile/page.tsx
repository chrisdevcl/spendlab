import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllUserExpenses } from "@/lib/services/expenses.service";
import { computeGlobalBalance } from "@/lib/utils/balance";
import ProfileView from "./_components/profile-view";
import type { Profile } from "@/types/database.types";

const DEV_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProfileStats {
  totalPaidThisMonth: number;
  expensesThisMonth: number;
  activeGroups: number;
  netBalance: number;
}

// ── Dev stubs ────────────────────────────────────────────────────────────────

const MOCK_PROFILE: Profile = {
  id: "u1",
  display_name: "Christian Dev",
  email: "christian@mail.com",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const MOCK_STATS: ProfileStats = {
  totalPaidThisMonth: 34000,
  expensesThisMonth: 3,
  activeGroups: 2,
  netBalance: -26000,
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ProfilePage() {
  if (DEV_MODE) {
    return (
      <ProfileView
        profile={MOCK_PROFILE}
        stats={MOCK_STATS}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Parallel: profile + expenses + groups
  const [{ data: profile }, expenses, { data: memberships }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      getAllUserExpenses(user.id),
      supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id),
    ]);

  // Current month filter
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const thisMonthExpenses = (expenses ?? []).filter(
    (e) => e.expense_date >= monthStart
  );

  const totalPaidThisMonth = thisMonthExpenses
    .filter((e) => e.paid_by === user.id)
    .reduce((sum, e) => sum + e.amount, 0);

  // Global net balance
  const groupIds = [...new Set((memberships ?? []).map((m) => m.group_id))];
  const { data: settlements } = groupIds.length
    ? await supabase.from("settlements").select("*").in("group_id", groupIds)
    : { data: [] };

  const allSplits = (expenses ?? []).flatMap((e) => e.splits);
  const profileMap = new Map<string, Profile>();
  (expenses ?? []).forEach((e) => {
    if (e.payer) profileMap.set(e.payer.id, e.payer);
    e.splits.forEach((s) => {
      if (s.profile) profileMap.set(s.profile.id, s.profile);
    });
  });
  const allUserIds = [...profileMap.keys()];

  const { net: netBalance } = computeGlobalBalance(
    expenses ?? [],
    allSplits,
    settlements ?? [],
    user.id,
    allUserIds
  );

  const stats: ProfileStats = {
    totalPaidThisMonth,
    expensesThisMonth: thisMonthExpenses.length,
    activeGroups: groupIds.length,
    netBalance,
  };

  return <ProfileView profile={profile} stats={stats} />;
}
