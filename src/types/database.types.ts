export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// All row types must use `type` (not `interface`) so they satisfy
// `Record<string, unknown>` — the constraint used by @supabase/postgrest-js
// GenericTable. TypeScript interfaces lack an implicit string index signature.

export type Profile = {
  id: string;
  display_name: string;
  email: string;
  created_at: string;
  updated_at: string;
};

export type Group = {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type GroupMember = {
  group_id: string;
  user_id: string;
  joined_at: string;
};

export type GroupInvitation = {
  id: string;
  group_id: string;
  invited_email: string;
  token: string;
  invited_by: string;
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
};

export type Expense = {
  id: string;
  group_id: string;
  paid_by: string;
  amount: number;
  description: string;
  expense_date: string;
  created_at: string;
};

export type ExpenseSplit = {
  id: string;
  expense_id: string;
  user_id: string;
  amount: number;
};

export type Settlement = {
  id: string;
  group_id: string;
  paid_by: string;
  paid_to: string;
  amount: number;
  settled_at: string;
};

export type PasskeyCredential = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  device_type: string | null;
  backed_up: boolean | null;
  transports: string[] | null;
  nickname: string | null;
  created_at: string;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
};

export type PendingInvitationRow = {
  id: string;
  group_id: string;
  group_name: string;
  member_count: number;
  inviter_name: string;
  expires_at: string;
};

// Matches the shape expected by @supabase/supabase-js generic constraints.
// Each table: Row / Insert / Update / Relationships.
// Schema: Tables, Views, Functions (no Enums/CompositeTypes needed).
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, "created_at" | "updated_at">;
        Update: Partial<Omit<Profile, "id">>;
        Relationships: [];
      };
      groups: {
        Row: Group;
        Insert: Omit<Group, "id" | "created_at" | "updated_at">;
        Update: Partial<Omit<Group, "id" | "created_at">>;
        Relationships: [];
      };
      group_members: {
        Row: GroupMember;
        Insert: Omit<GroupMember, "joined_at">;
        Update: Partial<GroupMember>;
        Relationships: [];
      };
      group_invitations: {
        Row: GroupInvitation;
        Insert: Omit<GroupInvitation, "id" | "created_at" | "accepted_at">;
        Update: Partial<Omit<GroupInvitation, "id" | "created_at">>;
        Relationships: [];
      };
      expenses: {
        Row: Expense;
        Insert: Omit<Expense, "id" | "created_at">;
        Update: Partial<Omit<Expense, "id" | "created_at">>;
        Relationships: [];
      };
      expense_splits: {
        Row: ExpenseSplit;
        Insert: Omit<ExpenseSplit, "id">;
        Update: Partial<Omit<ExpenseSplit, "id">>;
        Relationships: [];
      };
      settlements: {
        Row: Settlement;
        Insert: Omit<Settlement, "id">;
        Update: Partial<Omit<Settlement, "id">>;
        Relationships: [];
      };
      passkey_credentials: {
        Row: PasskeyCredential;
        Insert: Omit<PasskeyCredential, "id" | "created_at">;
        Update: Partial<Omit<PasskeyCredential, "id" | "created_at">>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: PushSubscriptionRow;
        Insert: Omit<PushSubscriptionRow, "id" | "created_at">;
        Update: Partial<Omit<PushSubscriptionRow, "id" | "created_at">>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      create_group_with_member: {
        Args: { group_name: string };
        Returns: Group;
      };
      get_pending_invitations: {
        Args: Record<string, never>;
        Returns: PendingInvitationRow[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
