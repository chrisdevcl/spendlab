import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getGroup } from "@/lib/services/groups.service";
import NewExpenseForm from "./_components/new-expense-form";
import type { Profile } from "@/types/database.types";

const DEV_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

const MOCK_MEMBERS: Profile[] = [
  { id: "u1", display_name: "Christian", email: "christian@mail.com", created_at: "", updated_at: "" },
  { id: "u2", display_name: "Ana García", email: "ana@mail.com", created_at: "", updated_at: "" },
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
        groupName="Casa"
        members={MOCK_MEMBERS}
        userId="u1"
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const group = await getGroup(id);
  if (!group) redirect("/groups");

  return (
    <NewExpenseForm
      groupId={id}
      groupName={group.name}
      members={group.members}
      userId={user.id}
    />
  );
}
