import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyGroups } from "@/lib/services/groups.service";
import type { GroupWithMembers, PendingInvitation } from "@/types";
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

  // If user has groups, redirect to the most recent one
  if (groups && groups.length > 0) {
    redirect(`/groups/${groups[0].id}`);
  }

  // No groups — show empty state
  return <GroupsList groups={[]} profile={profile} invitations={invitations} />;
}
