import { createClient } from "@/lib/supabase/server";
import type { Group, GroupInvitation, Profile } from "@/types/database.types";
import type { GroupWithMembers } from "@/types";

// ─── Members ────────────────────────────────────────────────────────────────

export async function getGroupMembers(
  groupId: string
): Promise<Profile[] | null> {
  try {
    const supabase = await createClient();

    const { data: rows, error: mErr } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId);

    if (mErr) {
      console.error("[getGroupMembers] memberships error:", mErr.message);
      return null;
    }
    if (!rows?.length) return [];

    const userIds = rows.map((r) => r.user_id);
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("*")
      .in("id", userIds);

    if (pErr) {
      console.error("[getGroupMembers] profiles error:", pErr.message);
      return null;
    }
    return profiles ?? [];
  } catch (err) {
    console.error("[getGroupMembers] unexpected error:", err);
    return null;
  }
}

// ─── Groups ─────────────────────────────────────────────────────────────────

export async function getMyGroups(
  userId: string
): Promise<GroupWithMembers[] | null> {
  try {
    const supabase = await createClient();

    // 1. Which groups does the user belong to?
    const { data: memberships, error: mErr } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId);

    if (mErr) {
      console.error("[getMyGroups] memberships error:", mErr.message);
      return null;
    }
    if (!memberships?.length) return [];

    const groupIds = memberships.map((m) => m.group_id);

    // 2. Fetch groups
    const { data: groups, error: gErr } = await supabase
      .from("groups")
      .select("*")
      .in("id", groupIds)
      .order("created_at", { ascending: false });

    if (gErr || !groups) {
      console.error("[getMyGroups] groups error:", gErr?.message);
      return null;
    }

    // 3. Batch-fetch all member rows + profiles in two queries
    const { data: allMemberRows, error: amErr } = await supabase
      .from("group_members")
      .select("group_id, user_id")
      .in("group_id", groupIds);

    if (amErr) {
      console.error("[getMyGroups] allMembers error:", amErr.message);
      return null;
    }

    const allUserIds = [...new Set((allMemberRows ?? []).map((r) => r.user_id))];
    const { data: allProfiles } = await supabase
      .from("profiles")
      .select("*")
      .in("id", allUserIds);

    const profileMap = new Map((allProfiles ?? []).map((p) => [p.id, p]));

    // Group members by group_id
    const membersByGroup = new Map<string, Profile[]>();
    (allMemberRows ?? []).forEach((row) => {
      const profile = profileMap.get(row.user_id);
      if (!profile) return;
      const arr = membersByGroup.get(row.group_id) ?? [];
      arr.push(profile);
      membersByGroup.set(row.group_id, arr);
    });

    return groups.map((group) => ({
      ...group,
      members: membersByGroup.get(group.id) ?? [],
      balance: 0, // Computed on client via computeGroupBalance
    }));
  } catch (err) {
    console.error("[getMyGroups] unexpected error:", err);
    return null;
  }
}

export async function getGroup(groupId: string): Promise<GroupWithMembers | null> {
  try {
    const supabase = await createClient();

    const { data: group, error: gErr } = await supabase
      .from("groups")
      .select("*")
      .eq("id", groupId)
      .maybeSingle();

    if (gErr || !group) {
      if (gErr) console.error("[getGroup] error:", gErr.message);
      return null;
    }

    const members = await getGroupMembers(groupId);
    return {
      ...group,
      members: members ?? [],
      balance: 0,
    };
  } catch (err) {
    console.error("[getGroup] unexpected error:", err);
    return null;
  }
}

export async function createGroup(
  name: string,
  _createdBy: string // mantenido por compatibilidad; el RPC usa auth.uid() internamente
): Promise<{ group: Group | null; error: string | null }> {
  try {
    const supabase = await createClient();

    // Usamos RPC SECURITY DEFINER para evitar el problema de INSERT+RETURNING con RLS:
    // al momento del RETURNING, el usuario todavía no figura en group_members,
    // así que la política SELECT "is_group_member" devolvería false → error 42501.
    // El RPC inserta grupo + miembro en una sola transacción atómica antes de devolver.
    const { data, error } = await supabase.rpc("create_group_with_member", {
      group_name: name,
    });

    if (error) {
      console.error("[createGroup] rpc error:", error.message);
      return { group: null, error: error.message };
    }

    return { group: data as Group, error: null };
  } catch (err) {
    console.error("[createGroup] unexpected error:", err);
    return { group: null, error: String(err) };
  }
}

// ─── Invitations ─────────────────────────────────────────────────────────────

export async function inviteMember(
  groupId: string,
  email: string,
  invitedBy: string
): Promise<GroupInvitation | null> {
  try {
    const supabase = await createClient();

    const token = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: invitation, error } = await supabase
      .from("group_invitations")
      .insert({
        group_id: groupId,
        invited_email: email,
        token,
        invited_by: invitedBy,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      console.error("[inviteMember] error:", error.message);
      return null;
    }
    return invitation;
  } catch (err) {
    console.error("[inviteMember] unexpected error:", err);
    return null;
  }
}

export async function getInvitation(
  token: string
): Promise<GroupInvitation | null> {
  try {
    const supabase = await createClient();

    const { data: invitation, error } = await supabase
      .from("group_invitations")
      .select("*")
      .eq("token", token)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .single();

    if (error) {
      console.error("[getInvitation] error:", error.message);
      return null;
    }
    return invitation;
  } catch (err) {
    console.error("[getInvitation] unexpected error:", err);
    return null;
  }
}

export async function acceptInvitation(
  token: string,
  userId: string
): Promise<boolean> {
  try {
    const supabase = await createClient();

    const invitation = await getInvitation(token);
    if (!invitation) {
      console.error("[acceptInvitation] invitation not found or expired");
      return false;
    }

    // Add as member (ignore conflict if already a member)
    const { error: mErr } = await supabase
      .from("group_members")
      .insert({ group_id: invitation.group_id, user_id: userId });

    if (mErr && mErr.code !== "23505") {
      // 23505 = unique_violation → already a member, still mark accepted
      console.error("[acceptInvitation] add member error:", mErr.message);
      return false;
    }

    // Mark as accepted
    const { error: aErr } = await supabase
      .from("group_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("token", token);

    if (aErr) {
      console.error("[acceptInvitation] update error:", aErr.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[acceptInvitation] unexpected error:", err);
    return false;
  }
}

export async function updateGroup(
  groupId: string,
  name: string
): Promise<{ error: string | null }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("groups")
      .update({ name })
      .eq("id", groupId);
    if (error) {
      console.error("[updateGroup] error:", error.message);
      return { error: error.message };
    }
    return { error: null };
  } catch (err) {
    console.error("[updateGroup] unexpected error:", err);
    return { error: String(err) };
  }
}

export async function deleteGroup(groupId: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("groups")
      .delete()
      .eq("id", groupId);
    if (error) {
      console.error("[deleteGroup] error:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[deleteGroup] unexpected error:", err);
    return false;
  }
}
