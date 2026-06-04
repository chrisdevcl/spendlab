import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllUserExpenses } from "@/lib/services/expenses.service";
import { computeGlobalBalance } from "@/lib/utils/balance";
import ProfileView from "./_components/profile-view";
import type { Profile } from "@/types/database.types";

const DEV_MODE = !process.env.NEXT_PUBLIC_SUPABASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProfileStats {
  totalPaid: number;
  totalExpenses: number;
  activeGroups: number;
  netBalance: number;
}

export interface PasskeyItem {
  id: string;
  device_type: string;
  backed_up: boolean;
  transports: string[];
  nickname: string | null;
  created_at: string;
}

// ── Dev stubs ────────────────────────────────────────────────────────────────

const MOCK_PROFILE: Profile = {
  id: "u1",
  display_name: "Christian Dev",
  email: "christian@mail.com",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const MOCK_STATS: ProfileStats = {
  totalPaid: 148000,
  totalExpenses: 12,
  activeGroups: 2,
  netBalance: -26000,
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function ProfilePage() {
  if (DEV_MODE) {
    return (
      <ProfileView
        profile={MOCK_PROFILE}
        stats={MOCK_STATS}
        passkeys={[]}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Parallel: profile + expenses + groups + passkeys
  const [{ data: profile }, expenses, { data: memberships }, { data: passkeysRaw }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      getAllUserExpenses(user.id),
      supabase.from("group_members").select("group_id").eq("user_id", user.id),
      supabase
        .from("passkey_credentials")
        .select("id, device_type, backed_up, transports, nickname, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
    ]);

  const passkeys: PasskeyItem[] = (passkeysRaw ?? []) as PasskeyItem[];

  const allExpenses = expenses ?? [];

  // All-time totals
  const totalPaid     = allExpenses
    .filter((e) => e.paid_by === user.id)
    .reduce((sum, e) => sum + e.amount, 0);
  const totalExpenses = allExpenses.length;

  // All-time net balance using paid_amount (no settlements needed)
  const groupIds = [...new Set((memberships ?? []).map((m) => m.group_id))];
  const profileMap = new Map<string, Profile>();
  allExpenses.forEach((e) => {
    if (e.payer) profileMap.set(e.payer.id, e.payer);
    e.splits.forEach((s) => {
      if (s.profile) profileMap.set(s.profile.id, s.profile);
    });
  });
  const allUserIds = [...profileMap.keys()];

  const { net: netBalance } = computeGlobalBalance(allExpenses, user.id, allUserIds);

  const stats: ProfileStats = {
    totalPaid,
    totalExpenses,
    activeGroups: groupIds.length,
    netBalance,
  };

  return <ProfileView profile={profile} stats={stats} passkeys={passkeys} />;
}
