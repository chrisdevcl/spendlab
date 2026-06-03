import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllUserExpenses } from "@/lib/services/expenses.service";
import ActivityList from "./_components/activity-list";
import type { ExpenseWithDetails, PendingInvitation } from "@/types";
import type { Profile } from "@/types/database.types";

const DEV_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

// ── Dev stubs ────────────────────────────────────────────────────────────────

const U1: Profile = { id: "u1", display_name: "Christian", email: "christian@mail.com", created_at: "", updated_at: "" };
const U2: Profile = { id: "u2", display_name: "Ana García", email: "ana@mail.com", created_at: "", updated_at: "" };
const U3: Profile = { id: "u3", display_name: "Pedro López", email: "pedro@mail.com", created_at: "", updated_at: "" };

const MOCK_GROUP_CASA = { id: "g1", name: "Casa", created_by: "u1", created_at: "", updated_at: "" };
const MOCK_GROUP_VIAJE = { id: "g2", name: "Viaje MdP", created_by: "u1", created_at: "", updated_at: "" };

const d = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

const MOCK_EXPENSES: ExpenseWithDetails[] = [
  {
    id: "e1", group_id: "g1", paid_by: "u2", created_by: "u1", amount: 18000,
    description: "Supermercado", expense_date: d(0),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP_CASA, payer: U2,
    splits: [
      { id: "s1", expense_id: "e1", user_id: "u1", amount: 9000, paid_amount: 0, profile: U1 },
      { id: "s2", expense_id: "e1", user_id: "u2", amount: 9000, paid_amount: 0, profile: U2 },
    ],
  },
  {
    id: "e2", group_id: "g1", paid_by: "u1", created_by: "u1", amount: 8000,
    description: "Gas", expense_date: d(1),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP_CASA, payer: U1,
    splits: [
      { id: "s3", expense_id: "e2", user_id: "u1", amount: 4000, paid_amount: 0, profile: U1 },
      { id: "s4", expense_id: "e2", user_id: "u2", amount: 4000, paid_amount: 0, profile: U2 },
    ],
  },
  {
    id: "e3", group_id: "g2", paid_by: "u3", created_by: "u3", amount: 45000,
    description: "Hotel noche 1", expense_date: d(3),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP_VIAJE, payer: U3,
    splits: [
      { id: "s5", expense_id: "e3", user_id: "u1", amount: 15000, paid_amount: 0, profile: U1 },
      { id: "s6", expense_id: "e3", user_id: "u2", amount: 15000, paid_amount: 0, profile: U2 },
      { id: "s7", expense_id: "e3", user_id: "u3", amount: 15000, paid_amount: 0, profile: U3 },
    ],
  },
  {
    id: "e4", group_id: "g1", paid_by: "u2", created_by: "u2", amount: 12000,
    description: "Internet", expense_date: d(12),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP_CASA, payer: U2,
    splits: [
      { id: "s8", expense_id: "e4", user_id: "u1", amount: 6000, paid_amount: 0, profile: U1 },
      { id: "s9", expense_id: "e4", user_id: "u2", amount: 6000, paid_amount: 0, profile: U2 },
    ],
  },
  {
    id: "e5", group_id: "g2", paid_by: "u1", created_by: "u1", amount: 32000,
    description: "Cena grupal", expense_date: d(35),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP_VIAJE, payer: U1,
    splits: [
      { id: "s10", expense_id: "e5", user_id: "u1", amount: 11000, paid_amount: 0, profile: U1 },
      { id: "s11", expense_id: "e5", user_id: "u2", amount: 11000, paid_amount: 0, profile: U2 },
      { id: "s12", expense_id: "e5", user_id: "u3", amount: 10000, paid_amount: 0, profile: U3 },
    ],
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ActivityPage() {
  if (DEV_MODE) {
    return (
      <ActivityList
        expenses={MOCK_EXPENSES}
        userId="u1"
        invitations={[]}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [expenses, { data: invitationsRaw }] = await Promise.all([
    getAllUserExpenses(user.id),
    supabase.rpc("get_pending_invitations"),
  ]);

  const invitations = (invitationsRaw ?? []) as PendingInvitation[];

  if (!expenses || expenses.length === 0) {
    return (
      <ActivityList
        expenses={[]}
        userId={user.id}
        invitations={invitations}
      />
    );
  }

  return (
    <ActivityList
      expenses={expenses}
      userId={user.id}
      invitations={invitations}
    />
  );
}
