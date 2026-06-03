export type {
  Database,
  Profile,
  Group,
  GroupMember,
  GroupInvitation,
  Expense,
  ExpenseSplit,
  Settlement,
  PasskeyCredential,
  PushSubscriptionRow,
  PendingInvitationRow,
} from "./database.types";

import type { Profile, Group, Expense, ExpenseSplit } from "./database.types";

export interface GroupWithMembers extends Group {
  members: Profile[];
  balance: number;
}

export interface SplitWithProfile extends ExpenseSplit {
  profile: Profile;
}

export interface ExpenseWithDetails extends Expense {
  payer: Profile | null;
  splits: SplitWithProfile[];
  group: Group;
}

export interface Debt {
  fromUserId: string;
  toUserId: string;
  amount: number;
  fromProfile?: Profile;
  toProfile?: Profile;
}

export interface GlobalBalance {
  net: number;
  debts: Debt[];
}

export interface PendingInvitation {
  id: string;
  group_id: string;
  group_name: string;
  member_count: number;
  inviter_name: string;
  expires_at: string;
}
