import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyGroups } from "@/lib/services/groups.service";
import { getAllUserExpenses } from "@/lib/services/expenses.service";
import type { GroupWithMembers, PendingInvitation, ExpenseWithDetails } from "@/types";
import GroupsList from "./_components/groups-list";

function computeGroupUserBalance(expenses: ExpenseWithDetails[], userId: string, groupId: string): number {
  let balance = 0;
  for (const exp of expenses) {
    if (exp.group_id !== groupId || !exp.paid_by) continue;
    if (exp.paid_by === userId) {
      for (const split of exp.splits) {
        if (split.user_id !== userId) balance += split.amount;
      }
    } else {
      const mySplit = exp.splits.find((s) => s.user_id === userId);
      if (mySplit) balance -= mySplit.amount;
    }
  }
  return balance;
}

// ── Dev stub: render with mock data when Supabase is not yet configured ──
const DEV_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

const MOCK_GROUPS: GroupWithMembers[] = [
  {
    id: "g1",
    name: "Casa",
    created_by: "u1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    members: [
      { id: "u1", display_name: "Tú", email: "tu@mail.com", created_at: "", updated_at: "" },
      { id: "u2", display_name: "Ana", email: "ana@mail.com", created_at: "", updated_at: "" },
    ],
    totalSpent: 124500,
    expenseCount: 7,
    userBalance: 42000,
  },
  {
    id: "g2",
    name: "Viaje Mar del Plata",
    created_by: "u1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    members: [
      { id: "u1", display_name: "Tú", email: "tu@mail.com", created_at: "", updated_at: "" },
      { id: "u2", display_name: "Ana", email: "ana@mail.com", created_at: "", updated_at: "" },
      { id: "u3", display_name: "Pedro", email: "pedro@mail.com", created_at: "", updated_at: "" },
    ],
    totalSpent: 89200,
    expenseCount: 3,
    userBalance: -15000,
  },
  {
    id: "g3",
    name: "Oficina",
    created_by: "u1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    members: [
      { id: "u1", display_name: "Tú", email: "tu@mail.com", created_at: "", updated_at: "" },
    ],
    totalSpent: 5000,
    expenseCount: 1,
    userBalance: 0,
  },
];

const MOCK_INVITATIONS: PendingInvitation[] = [
  {
    id: "inv1",
    group_id: "g99",
    group_name: "Amigos del gym",
    member_count: 4,
    inviter_name: "Ana",
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

export default async function GroupsPage() {
  if (DEV_MODE) {
    const mockProfile = { id: "u1", display_name: "Christian", email: "christian@mail.com", created_at: "", updated_at: "" };
    return <GroupsList groups={MOCK_GROUPS} profile={mockProfile} invitations={MOCK_INVITATIONS} userId="u1" />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Profile + groups + invitations + expenses in parallel
  const [{ data: profile }, groups, { data: invitationsRaw }, expenses] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getMyGroups(user.id),
    supabase.rpc("get_pending_invitations"),
    getAllUserExpenses(user.id),
  ]);

  const invitations: PendingInvitation[] = (invitationsRaw ?? []) as PendingInvitation[];

  const groupsWithBalance = (groups ?? []).map((g) => ({
    ...g,
    userBalance: computeGroupUserBalance(expenses ?? [], user.id, g.id),
    expenseCount: (expenses ?? []).filter((e) => e.group_id === g.id).length,
  }));

  return <GroupsList groups={groupsWithBalance} profile={profile} invitations={invitations} userId={user.id} />;
}
