import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllUserExpenses } from "@/lib/services/expenses.service";
import { computeGlobalBalance } from "@/lib/utils/balance";
import ActivityList from "./_components/activity-list";
import type { ExpenseWithDetails, GlobalBalance } from "@/types";
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
    id: "e1", group_id: "g1", paid_by: "u2", amount: 18000,
    description: "Supermercado", expense_date: d(0),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP_CASA, payer: U2,
    splits: [
      { id: "s1", expense_id: "e1", user_id: "u1", amount: 9000, profile: U1 },
      { id: "s2", expense_id: "e1", user_id: "u2", amount: 9000, profile: U2 },
    ],
  },
  {
    id: "e2", group_id: "g1", paid_by: "u1", amount: 8000,
    description: "Gas", expense_date: d(1),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP_CASA, payer: U1,
    splits: [
      { id: "s3", expense_id: "e2", user_id: "u1", amount: 4000, profile: U1 },
      { id: "s4", expense_id: "e2", user_id: "u2", amount: 4000, profile: U2 },
    ],
  },
  {
    id: "e3", group_id: "g2", paid_by: "u3", amount: 45000,
    description: "Hotel noche 1", expense_date: d(3),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP_VIAJE, payer: U3,
    splits: [
      { id: "s5", expense_id: "e3", user_id: "u1", amount: 15000, profile: U1 },
      { id: "s6", expense_id: "e3", user_id: "u2", amount: 15000, profile: U2 },
      { id: "s7", expense_id: "e3", user_id: "u3", amount: 15000, profile: U3 },
    ],
  },
  {
    id: "e4", group_id: "g1", paid_by: "u2", amount: 12000,
    description: "Internet", expense_date: d(12),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP_CASA, payer: U2,
    splits: [
      { id: "s8", expense_id: "e4", user_id: "u1", amount: 6000, profile: U1 },
      { id: "s9", expense_id: "e4", user_id: "u2", amount: 6000, profile: U2 },
    ],
  },
  {
    id: "e5", group_id: "g2", paid_by: "u1", amount: 32000,
    description: "Cena grupal", expense_date: d(35),
    created_at: new Date().toISOString(),
    group: MOCK_GROUP_VIAJE, payer: U1,
    splits: [
      { id: "s10", expense_id: "e5", user_id: "u1", amount: 11000, profile: U1 },
      { id: "s11", expense_id: "e5", user_id: "u2", amount: 11000, profile: U2 },
      { id: "s12", expense_id: "e5", user_id: "u3", amount: 10000, profile: U3 },
    ],
  },
];

const MOCK_GLOBAL_BALANCE: GlobalBalance = {
  net: -26000,
  debts: [
    { fromUserId: "u1", toUserId: "u2", amount: 20000, fromProfile: U1, toProfile: U2 },
    { fromUserId: "u1", toUserId: "u3", amount: 6000, fromProfile: U1, toProfile: U3 },
  ],
};

// ── Date grouping ─────────────────────────────────────────────────────────────

export interface DateGroup {
  label: string;
  expenses: ExpenseWithDetails[];
}

function groupByDate(expenses: ExpenseWithDetails[]): DateGroup[] {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const weekStart = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

  const ordered: string[] = []; // label insertion order
  const map = new Map<string, ExpenseWithDetails[]>();

  for (const expense of expenses) {
    const date = expense.expense_date;
    let label: string;

    if (date === today) {
      label = "Hoy";
    } else if (date === yesterday) {
      label = "Ayer";
    } else if (date > weekStart) {
      label = "Esta semana";
    } else {
      // "mayo 2025" → capitalise first letter
      const d = new Date(`${date}T12:00:00`);
      const raw = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
      label = raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    if (!map.has(label)) {
      ordered.push(label);
      map.set(label, []);
    }
    map.get(label)!.push(expense);
  }

  return ordered.map((label) => ({ label, expenses: map.get(label)! }));
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ActivityPage() {
  if (DEV_MODE) {
    return (
      <ActivityList
        groups={groupByDate(MOCK_EXPENSES)}
        globalBalance={MOCK_GLOBAL_BALANCE}
        userId="u1"
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const expenses = await getAllUserExpenses(user.id);
  if (!expenses || expenses.length === 0) {
    return (
      <ActivityList
        groups={[]}
        globalBalance={{ net: 0, debts: [] }}
        userId={user.id}
      />
    );
  }

  // Collect group IDs to fetch settlements
  const groupIds = [...new Set(expenses.map((e) => e.group_id))];
  const { data: settlements } = await supabase
    .from("settlements")
    .select("*")
    .in("group_id", groupIds);

  // Build profile map from all payers + split profiles
  const profileMap = new Map<string, Profile>();
  for (const exp of expenses) {
    if (exp.payer) profileMap.set(exp.payer.id, exp.payer);
    for (const s of exp.splits) {
      if (s.profile) profileMap.set(s.profile.id, s.profile);
    }
  }

  const allUserIds = [...profileMap.keys()];
  const allSplits = expenses.flatMap((e) => e.splits);

  // Debts use ALL-TIME data — outstanding amounts between users regardless of month
  const rawBalance = computeGlobalBalance(
    expenses,
    allSplits,
    settlements ?? [],
    user.id,
    allUserIds
  );

  const globalBalance: GlobalBalance = {
    // net is unused in ActivityList (totals are computed per-month in the component)
    net: rawBalance.net,
    debts: rawBalance.debts.map((d) => ({
      ...d,
      fromProfile: profileMap.get(d.fromUserId),
      toProfile: profileMap.get(d.toUserId),
    })),
  };

  return (
    <ActivityList
      groups={groupByDate(expenses)}
      globalBalance={globalBalance}
      userId={user.id}
    />
  );
}
