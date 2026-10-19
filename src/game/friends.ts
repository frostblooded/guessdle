// Friends (GLOSSARY.md Friend): what the Friends page and the result screens get from the server.

// A player as their friends see them: the username, or the email when they have none
export interface Friend {
  id: number;
  name: string;
}

// GET /api/friends
export interface FriendList {
  friends: Friend[];
  // Requests to this player, waiting for their answer
  incoming: Friend[];
  // This player's requests, waiting for the other's answer
  outgoing: Friend[];
}

// POST /api/friends: "accepted" when the other player had already asked this one
export type FriendRequestOutcome = "sent" | "accepted";

// A friend's first try on the day the stats are for
export interface FriendResult {
  name: string;
  won: boolean;
  guesses: number;
  // null when unknown or not a win
  seconds: number | null;
}

// A friend's first score on a quiz
export interface QuizFriendResult {
  name: string;
  score: number;
  seconds: number | null;
}
