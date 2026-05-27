import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyGroups } from "@/lib/services/groups.service";
import { computeGroupBalance } from "@/lib/utils/balance";
import type { GroupWithMembers, PendingInvitation } from "@/types";
import type { Expense, ExpenseSplit, Settlement } from "@/types/database.types";
import GroupsList from "./_components/groups-list";

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
    balance: 18500,
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
    balance: -9200,
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
    balance: 0,
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
    return <GroupsList groups={MOCK_GROUPS} profile={mockProfile} invitations={MOCK_INVITATIONS} />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Profile + groups + invitations in parallel
  const [{ data: profile }, groups, { data: invitationsRaw }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getMyGroups(user.id),
    supabase.rpc("get_pending_invitations"),
  ]);

  const invitations: PendingInvitation[] = (invitationsRaw ?? []) as PendingInvitation[];

  if (!groups || groups.length === 0) {
    return <GroupsList groups={[]} profile={profile} invitations={invitations} />;
  }

  // Batch-fetch ALL expenses/splits/settlements for all groups in 3 queries
  const groupIds = groups.map((g) => g.id);

  const { data: allExpenses } = await supabase
    .from("expenses")
    .select("*")
    .in("group_id", groupIds);

  const expenseIds = (allExpenses ?? []).map((e) => e.id);

  const [{ data: allSplits }, { data: allSettlements }] = await Promise.all([
    expenseIds.length
      ? supabase.from("expense_splits").select("*").in("expense_id", expenseIds)
      : Promise.resolve({ data: [] as ExpenseSplit[] }),
    supabase.from("settlements").select("*").in("group_id", groupIds),
  ]);

  // Compute balance per group and attach
  const groupsWithBalance: GroupWithMembers[] = groups.map((group) => {
    const expenses = (allExpenses ?? []).filter(
      (e): e is Expense => e.group_id === group.id
    );
    const splits = (allSplits ?? []).filter((s): s is ExpenseSplit =>
      expenses.some((e) => e.id === s.expense_id)
    );
    const settlements = (allSettlements ?? []).filter(
      (s): s is Settlement => s.group_id === group.id
    );

    return {
      ...group,
      balance: computeGroupBalance(expenses, splits, settlements, user.id),
    };
  });

  return <GroupsList groups={groupsWithBalance} profile={profile} invitations={invitations} />;
}
