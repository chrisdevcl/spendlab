import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroup } from "@/lib/services/groups.service";
import {
  getGroupExpenses,
  getGroupSplits,
  getGroupSettlements,
} from "@/lib/services/expenses.service";
import GroupDetail from "./_components/group-detail";
import type { GroupWithMembers, ExpenseWithDetails } from "@/types";
import type { Profile, Settlement } from "@/types/database.types";

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

  return (
    <GroupDetail
      group={group}
      expenses={expenses ?? []}
      settlements={(settlements ?? []) as Settlement[]}
      userId={user.id}
      profile={profile}
    />
  );
}
