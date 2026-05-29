import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroup } from "@/lib/services/groups.service";
import {
  getGroupExpenses,
  getGroupSplits,
  getGroupSettlements,
} from "@/lib/services/expenses.service";
import { computeGlobalBalance } from "@/lib/utils/balance";
import GroupDetail from "./_components/group-detail";
import type { GroupWithMembers, ExpenseWithDetails, GlobalBalance } from "@/types";
import type { Profile } from "@/types/database.types";

const DEV_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

// ── Dev stubs ────────────────────────────────────────────────────────────────

const MOCK_PROFILE: Profile = {
  id: "u1",
  display_name: "Christian",
  email: "christian@mail.com",
  created_at: "",
  updated_at: "",
};

const MOCK_ANA: Profile = {
  id: "u2",
  display_name: "Ana García",
  email: "ana@mail.com",
  created_at: "",
  updated_at: "",
};

const MOCK_GROUP: GroupWithMembers = {
  id: "g1",
  name: "Casa",
  created_by: "u1",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  members: [MOCK_PROFILE, MOCK_ANA],
  balance: -5000,
};

const d = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

const MOCK_EXPENSES: ExpenseWithDetails[] = [
  {
    id: "e1",
    group_id: "g1",
    paid_by: "u2",
    amount: 18000,
    description: "Supermercado",
    expense_date: d(2),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP,
    payer: MOCK_ANA,
    splits: [
      { id: "s1", expense_id: "e1", user_id: "u1", amount: 9000, profile: MOCK_PROFILE },
      { id: "s2", expense_id: "e1", user_id: "u2", amount: 9000, profile: MOCK_ANA },
    ],
  },
  {
    id: "e2",
    group_id: "g1",
    paid_by: "u1",
    amount: 8000,
    description: "Gas",
    expense_date: d(5),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP,
    payer: MOCK_PROFILE,
    splits: [
      { id: "s3", expense_id: "e2", user_id: "u1", amount: 4000, profile: MOCK_PROFILE },
      { id: "s4", expense_id: "e2", user_id: "u2", amount: 4000, profile: MOCK_ANA },
    ],
  },
  {
    id: "e3",
    group_id: "g1",
    paid_by: "u2",
    amount: 12000,
    description: "Internet",
    expense_date: d(12),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP,
    payer: MOCK_ANA,
    splits: [
      { id: "s5", expense_id: "e3", user_id: "u1", amount: 6000, profile: MOCK_PROFILE },
      {
        id: "s6",
        expense_id: "e3",
        user_id: "u2",
        amount: 6000,
        profile: MOCK_ANA,
      },
    ],
  },
];

const MOCK_GLOBAL_BALANCE: GlobalBalance = {
  net: -11000,
  debts: [
    {
      fromUserId: "u1",
      toUserId: "u2",
      amount: 11000,
      fromProfile: MOCK_PROFILE,
      toProfile: MOCK_ANA,
    },
  ],
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (DEV_MODE) {
    return (
      <GroupDetail
        group={MOCK_GROUP}
        expenses={MOCK_EXPENSES}
        globalBalance={MOCK_GLOBAL_BALANCE}
        userId="u1"
        profile={MOCK_PROFILE}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Parallel fetch: group metadata + all expense data
  const [group, expenses, splits, settlements, { data: profile }] =
    await Promise.all([
      getGroup(id),
      getGroupExpenses(id),
      getGroupSplits(id),
      getGroupSettlements(id),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
    ]);

  if (!group) redirect("/groups");

  // Balance considers only the current calendar month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartDate = monthStart.toISOString().slice(0, 10); // YYYY-MM-DD

  const memberIds = group.members.map((m) => m.id);
  const profileMap = new Map(group.members.map((m) => [m.id, m]));

  // Monthly net (for the balance card summary)
  const monthExpenses    = (expenses    ?? []).filter(e => e.expense_date >= monthStartDate);
  const monthExpenseIds  = new Set(monthExpenses.map(e => e.id));
  const monthSplits      = (splits      ?? []).filter(s => monthExpenseIds.has(s.expense_id));
  const monthSettlements = (settlements ?? []).filter(s => s.settled_at >= monthStart.toISOString());
  const { net: monthlyNet } = computeGlobalBalance(monthExpenses, monthSplits, monthSettlements, user.id, memberIds);

  // All-time debts (outstanding amounts between members, regardless of month)
  const allTimeBalance = computeGlobalBalance(expenses ?? [], splits ?? [], settlements ?? [], user.id, memberIds);

  const enrichedBalance: GlobalBalance = {
    net: monthlyNet,
    debts: allTimeBalance.debts.map((debt) => ({
      ...debt,
      fromProfile: profileMap.get(debt.fromUserId),
      toProfile: profileMap.get(debt.toUserId),
    })),
  };

  return (
    <GroupDetail
      group={group}
      expenses={expenses ?? []}
      globalBalance={enrichedBalance}
      userId={user.id}
      profile={profile}
    />
  );
}
