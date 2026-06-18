import { createClient } from "@/lib/supabase/server";
import BottomNav from "./bottom-nav";

export default async function BottomNavWrapper() {
  let showSaldos = false;

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Get all groups the user belongs to
      const { data: memberships } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id);

      if (memberships?.length) {
        const groupIds = memberships.map((m) => m.group_id);
        // Check if any of those groups has at least one other member
        const { data: others } = await supabase
          .from("group_members")
          .select("group_id")
          .in("group_id", groupIds)
          .neq("user_id", user.id)
          .limit(1);

        showSaldos = !!others?.length;
      }
    }
  } catch {
    // If auth/db fails, don't show saldos
  }

  return <BottomNav showSaldos={showSaldos} />;
}
