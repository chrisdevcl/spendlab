import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllUserExpenses, getAllUserSettlements } from "@/lib/services/expenses.service";
import { getMyGroups } from "@/lib/services/groups.service";
import SaldosView from "./_components/saldos-view";
import type { ExpenseWithDetails, PendingInvitation } from "@/types";
import type { Profile, Settlement } from "@/types/database.types";

const DEV_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

// ── Dev stubs ────────────────────────────────────────────────────────────────

const U1: Profile = { id: "u1", display_name: "Christian", email: "c@mail.com", created_at: "", updated_at: "" };
const U2: Profile = { id: "u2", display_name: "Ana García", email: "a@mail.com", created_at: "", updated_at: "" };
const U3: Profile = { id: "u3", display_name: "Pedro López", email: "p@mail.com", created_at: "", updated_at: "" };

const G1 = { id: "g1", name: "Casa", created_by: "u1", created_at: "", updated_at: "" };
const G2 = { id: "g2", name: "Viaje MdP", created_by: "u1", created_at: "", updated_at: "" };

const d = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);

const MOCK_EXPENSES: ExpenseWithDetails[] = [
  // U2 pagó → yo le debo $9.000 (rojo)
  {
    id: "e1", group_id: "g1", paid_by: "u2", created_by: "u2", amount: 18000,
    description: "Supermercado", expense_date: d(1), created_at: new Date().toISOString(),
    group: G1, payer: U2,
    splits: [
      { id: "s1", expense_id: "e1", user_id: "u1", amount: 9000, paid_amount: 0, payments: [], profile: U1 },
      { id: "s2", expense_id: "e1", user_id: "u2", amount: 9000, paid_amount: 0, payments: [], profile: U2 },
    ],
  },
  // Yo pagué → U2 me debe $4.000 (verde)
  {
    id: "e2", group_id: "g1", paid_by: "u1", created_by: "u1", amount: 8000,
    description: "Gas", expense_date: d(3), created_at: new Date().toISOString(),
    group: G1, payer: U1,
    splits: [
      { id: "s3", expense_id: "e2", user_id: "u1", amount: 4000, paid_amount: 0, payments: [], profile: U1 },
      { id: "s4", expense_id: "e2", user_id: "u2", amount: 4000, paid_amount: 0, payments: [], profile: U2 },
    ],
  },
  // U3 pagó → yo le debo $15.000 (rojo)
  {
    id: "e3", group_id: "g2", paid_by: "u3", created_by: "u3", amount: 45000,
    description: "Hotel noche 1", expense_date: d(5), created_at: new Date().toISOString(),
    group: G2, payer: U3,
    splits: [
      { id: "s5", expense_id: "e3", user_id: "u1", amount: 15000, paid_amount: 0, payments: [], profile: U1 },
      { id: "s6", expense_id: "e3", user_id: "u2", amount: 15000, paid_amount: 0, payments: [], profile: U2 },
      { id: "s7", expense_id: "e3", user_id: "u3", amount: 15000, paid_amount: 0, payments: [], profile: U3 },
    ],
  },
  // Yo pagué → U2 me debe $11.000, U3 me debe $10.000 (verde)
  {
    id: "e4", group_id: "g2", paid_by: "u1", created_by: "u1", amount: 32000,
    description: "Cena grupal", expense_date: d(35), created_at: new Date().toISOString(),
    group: G2, payer: U1,
    splits: [
      { id: "s8",  expense_id: "e4", user_id: "u1", amount: 11000, paid_amount: 0, payments: [], profile: U1 },
      { id: "s9",  expense_id: "e4", user_id: "u2", amount: 11000, paid_amount: 0, payments: [], profile: U2 },
      { id: "s10", expense_id: "e4", user_id: "u3", amount: 10000, paid_amount: 0, payments: [], profile: U3 },
    ],
  },
];

const MOCK_PEOPLE: Profile[] = [U2, U3];
const MOCK_SETTLEMENTS: Settlement[] = [];
const MOCK_INVITATIONS: PendingInvitation[] = [];

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function SaldosPage() {
  if (DEV_MODE) {
    return (
      <SaldosView
        people={MOCK_PEOPLE}
        expenses={MOCK_EXPENSES}
        settlements={MOCK_SETTLEMENTS}
        invitations={MOCK_INVITATIONS}
        userId="u1"
      />
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [groups, expenses, settlements, { data: invitationsRaw }] = await Promise.all([
    getMyGroups(user.id),
    getAllUserExpenses(user.id),
    getAllUserSettlements(user.id),
    supabase.rpc("get_pending_invitations"),
  ]);

  // Unique people from all groups, excluding self
  const peopleMap = new Map<string, Profile>();
  for (const g of groups ?? []) {
    for (const m of g.members) {
      if (m.id !== user.id) peopleMap.set(m.id, m);
    }
  }
  const people = [...peopleMap.values()];

  const invitations: PendingInvitation[] = (invitationsRaw ?? []) as PendingInvitation[];

  return (
    <SaldosView
      people={people}
      expenses={expenses ?? []}
      settlements={settlements}
      invitations={invitations}
      userId={user.id}
    />
  );
}
