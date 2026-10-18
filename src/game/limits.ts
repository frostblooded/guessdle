// Size limits for games, shared by the server checks, the editor scripts and (via a test) the
// HTML maxlength attributes. Change a number here and the test names every page to update.

export const MAX_NAME = 60;
export const MAX_DESCRIPTION = 500;
export const MIN_SLUG = 3;
export const MAX_SLUG = 40;
export const MAX_ENTRY_NAME = 60;
export const MAX_ATTRIBUTES = 10;
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
// Zoom games: how many zoomed parts each entry has (one try per part), and the smallest part side in image pixels
export const MAX_ZOOM_PARTS = 6;
export const DEFAULT_ZOOM_PARTS = 5;
export const MIN_ZOOM_PART = 16;
