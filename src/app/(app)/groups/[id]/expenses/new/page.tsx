import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroup, getMyGroups } from "@/lib/services/groups.service";
import NewExpenseForm from "./_components/new-expense-form";
import type { Profile } from "@/types/database.types";
import type { GroupWithMembers } from "@/types";

const DEV_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

const MOCK_MEMBERS: Profile[] = [
  { id: "u1", display_name: "Christian", email: "christian@mail.com", created_at: "", updated_at: "" },
  { id: "u2", display_name: "Ana García", email: "ana@mail.com", created_at: "", updated_at: "" },
];

const MOCK_GROUPS: GroupWithMembers[] = [
  { id: "g1", name: "Casa", created_by: "u1", created_at: "", updated_at: "", members: MOCK_MEMBERS, balance: 0 },
  { id: "g2", name: "Viaje", created_by: "u1", created_at: "", updated_at: "", members: [MOCK_MEMBERS[0]], balance: 0 },
];

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (DEV_MODE) {
    return (
      <NewExpenseForm
        groupId={id}
        allGroups={MOCK_GROUPS}
        userId="u1"
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [group, allGroups] = await Promise.all([
    getGroup(id),
    getMyGroups(user.id),
  ]);
  if (!group) redirect("/groups");

  return (
    <NewExpenseForm
      groupId={id}
      allGroups={allGroups ?? [group]}
      userId={user.id}
    />
  );
}
