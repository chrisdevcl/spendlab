export type {
  Database,
  Profile,
  Group,
  GroupMember,
  GroupInvitation,
  Expense,
  ExpenseSplit,
  SplitPayment,
  Settlement,
  PasskeyCredential,
  PushSubscriptionRow,
  PendingInvitationRow,
} from "./database.types";

import type { Profile, Group, Expense, ExpenseSplit, SplitPayment } from "./database.types";

export interface GroupWithMembers extends Group {
  members: Profile[];
  balance: number;
}

export interface SplitWithProfile extends ExpenseSplit {
  profile: Profile;
  payments: SplitPayment[];
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

export interface AcceptedInvitation {
  id: string;
  group_id: string;
  group_name: string;
  invitee_name: string;
  accepted_at: string;
}
