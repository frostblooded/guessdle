// Size limits for games, shared by the server checks, the editor scripts and (via a test) the
// HTML maxlength attributes. Change a number here and the test names every page to update.

export const MAX_NAME = 60;
export const MAX_DESCRIPTION = 500;
export const MIN_SLUG = 3;
export const MAX_SLUG = 40;
export const MAX_ENTRY_NAME = 60;
// 10, plus room for the Photo column every classic game had built in before Image attributes
export const MAX_ATTRIBUTES = 11;
export const MAX_ATTRIBUTE_NAME = 40;
// One value, and how many a List attribute may hold
export const MAX_VALUE_LENGTH = 200;
export const MAX_LIST_ITEMS = 20;
export const MAX_REASON = 500;
// A game plays with at least this many active entries
export const MIN_ENTRIES = 2;
// Party mode (issue #90): a player's nickname, and how many players one party holds
export const MAX_NICKNAME = 20;
export const MAX_PARTY_PLAYERS = 30;
// Open parties one host may run at once
export const MAX_OPEN_PARTIES = 5;
// Blur games: the most tries a game may give, one per square of its 3x3 grid
export const MAX_BLUR_TRIES = 9;
// Sequence games: how many photos (and tries) a new game starts with, like guessthe.game
export const DEFAULT_SHOTS = 6;
// Playlists: a player's public username, and how many playlists and games each may hold
export const MIN_USERNAME = 3;
export const MAX_USERNAME = 20;
export const MAX_PLAYLISTS = 50;
export const MAX_PLAYLIST_GAMES = 200;
// Quiz games: a question's text, and how many options a multiple choice question has, each this long
export const MAX_QUESTION = 300;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;
export const MAX_OPTION = 100;
