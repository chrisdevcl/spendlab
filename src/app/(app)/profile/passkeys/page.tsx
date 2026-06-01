import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PasskeysView from "./_components/passkeys-view";
import type { PasskeyItem } from "../page";

export default async function PasskeysPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("passkey_credentials")
    .select("id, device_type, backed_up, transports, nickname, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const passkeys: PasskeyItem[] = (data ?? []) as PasskeyItem[];

  return <PasskeysView passkeys={passkeys} />;
}
