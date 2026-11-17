export interface Friend {
  id: number;
  name: string;
}

export interface FriendList {
  friends: Friend[];
  incoming: Friend[];
  outgoing: Friend[];
}

export type FriendRequestOutcome = "sent" | "accepted";

export interface FriendResult {
  name: string;
  won: boolean;
  guesses: number;
  seconds: number | null;
}

export interface QuizFriendResult {
  name: string;
  score: number;
  seconds: number | null;
}
