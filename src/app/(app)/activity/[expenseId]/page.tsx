import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getExpense } from "@/lib/services/expenses.service";
import ExpenseDetail from "./_components/expense-detail";
import type { ExpenseWithDetails } from "@/types";
import type { Profile } from "@/types/database.types";

const DEV_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

// ── Dev stubs ────────────────────────────────────────────────────────────────

const U1: Profile = { id: "u1", display_name: "Christian", email: "christian@mail.com", created_at: "", updated_at: "" };
const U2: Profile = { id: "u2", display_name: "Ana García", email: "ana@mail.com", created_at: "", updated_at: "" };
const U3: Profile = { id: "u3", display_name: "Pedro López", email: "pedro@mail.com", created_at: "", updated_at: "" };

const MOCK_GROUP = { id: "g2", name: "Viaje MdP", created_by: "u1", created_at: "", updated_at: "" };

const MOCK_EXPENSE: ExpenseWithDetails = {
  id: "e3",
  group_id: "g2",
  paid_by: "u3",
  created_by: "u3",
  amount: 45000,
  description: "Hotel noche 1",
  expense_date: new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10),
  created_at: new Date().toISOString(),
  group: MOCK_GROUP,
  payer: U3,
  splits: [
    { id: "s5", expense_id: "e3", user_id: "u1", amount: 15000, paid_amount: 0, payments: [], profile: U1 },
    { id: "s6", expense_id: "e3", user_id: "u2", amount: 15000, paid_amount: 0, payments: [], profile: U2 },
    { id: "s7", expense_id: "e3", user_id: "u3", amount: 15000, paid_amount: 0, payments: [], profile: U3 },
  ],
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ expenseId: string }>;
}) {
  const { expenseId } = await params;

  if (DEV_MODE) {
    return <ExpenseDetail expense={MOCK_EXPENSE} userId="u1" />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const expense = await getExpense(expenseId);
  if (!expense) notFound();

  return <ExpenseDetail expense={expense} userId={user.id} />;
}
