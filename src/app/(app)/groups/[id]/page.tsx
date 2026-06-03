import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroup, getMyGroups } from "@/lib/services/groups.service";
import {
  getGroupExpenses,
  getGroupSettlements,
} from "@/lib/services/expenses.service";
import { computeGroupBalance } from "@/lib/utils/balance";
import GroupDetail from "./_components/group-detail";
import type { GroupWithMembers, ExpenseWithDetails, PendingInvitation } from "@/types";
import type { Profile, Settlement, Expense, ExpenseSplit } from "@/types/database.types";

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
    created_by: "u2",
    amount: 18000,
    description: "Supermercado",
    expense_date: d(2),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP,
    payer: MOCK_ANA,
    splits: [
      { id: "s1", expense_id: "e1", user_id: "u1", amount: 9000, paid_amount: 0, payments: [], profile: MOCK_PROFILE },
      { id: "s2", expense_id: "e1", user_id: "u2", amount: 9000, paid_amount: 0, payments: [], profile: MOCK_ANA },
    ],
  },
  {
    id: "e2",
    group_id: "g1",
    paid_by: "u1",
    created_by: "u1",
    amount: 8000,
    description: "Gas",
    expense_date: d(5),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP,
    payer: MOCK_PROFILE,
    splits: [
      { id: "s3", expense_id: "e2", user_id: "u1", amount: 4000, paid_amount: 0, payments: [], profile: MOCK_PROFILE },
      { id: "s4", expense_id: "e2", user_id: "u2", amount: 4000, paid_amount: 0, payments: [], profile: MOCK_ANA },
    ],
  },
  {
    id: "e3",
    group_id: "g1",
    paid_by: "u2",
    created_by: "u2",
    amount: 12000,
    description: "Internet",
    expense_date: d(12),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP,
    payer: MOCK_ANA,
    splits: [
      { id: "s5", expense_id: "e3", user_id: "u1", amount: 6000, paid_amount: 0, payments: [], profile: MOCK_PROFILE },
      {
        id: "s6",
        expense_id: "e3",
        user_id: "u2",
        amount: 6000,
        paid_amount: 0,
        payments: [],
        profile: MOCK_ANA,
      },
    ],
  },
];

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
        settlements={[]}
        userId="u1"
        profile={MOCK_PROFILE}
        allGroups={[MOCK_GROUP]}
        invitations={[]}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Parallel fetch: current group + all user groups + invitations + expense data
  const [group, allGroupsRaw, expenses, settlements, { data: profile }, { data: invitationsRaw }] =
    await Promise.all([
      getGroup(id),
      getMyGroups(user.id),
      getGroupExpenses(id),
      getGroupSettlements(id),
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.rpc("get_pending_invitations"),
    ]);

  if (!group) redirect("/groups");

  // Compute balances for all groups
  const groupIds = (allGroupsRaw ?? []).map((g) => g.id);
  const [{ data: allExpenses }, { data: allSettlements }] = await Promise.all([
    groupIds.length
      ? supabase.from("expenses").select("*").in("group_id", groupIds)
      : Promise.resolve({ data: [] as Expense[] }),
    groupIds.length
      ? supabase.from("settlements").select("*").in("group_id", groupIds)
      : Promise.resolve({ data: [] as Settlement[] }),
  ]);

  const expenseIds = (allExpenses ?? []).map((e) => e.id);
  const { data: allSplits } = expenseIds.length
    ? await supabase.from("expense_splits").select("*").in("expense_id", expenseIds)
    : { data: [] as ExpenseSplit[] };

  const allGroups: GroupWithMembers[] = (allGroupsRaw ?? []).map((g) => {
    const gExpenses = (allExpenses ?? []).filter((e): e is Expense => e.group_id === g.id);
    const gSplits   = (allSplits   ?? []).filter((s): s is ExpenseSplit => gExpenses.some((e) => e.id === s.expense_id));
    const gSettle   = (allSettlements ?? []).filter((s): s is Settlement => s.group_id === g.id);
    return { ...g, balance: computeGroupBalance(gExpenses, gSplits, gSettle, user.id) };
  });

  const invitations = (invitationsRaw ?? []) as PendingInvitation[];

  return (
    <GroupDetail
      group={group}
      expenses={expenses ?? []}
      settlements={(settlements ?? []) as Settlement[]}
      userId={user.id}
      profile={profile}
      allGroups={allGroups}
      invitations={invitations}
    />
  );
}
