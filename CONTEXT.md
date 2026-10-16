# Guessdle

A site of daily guessing games. Players guess the answer of the day in a game by comparing attributes.

## Language

**Game**:
One guessing game: a name, a cover image, attribute definitions and a roster of entries. Has its own Daily Answers. Created by a signed-in user (its **Owner**), or ownerless (the original Petdle game, editable only by Admins).

**Approval**:
An Admin's sign-off that lets a Game appear in the front-page gallery. Unapproved Games stay reachable by link. Editing the text or images of an approved Game resets it to pending.

**Owner**:
The signed-in user who created a Game. Owners and Admins edit the Game, set its Overrides, submit, unpublish and delete it. Deleting a user deletes their Games.

**Draft**:
A Game's first status. Only its Owner and Admins can see it (everyone else gets a 404) until it is submitted. Statuses: draft, pending, approved, rejected.

**Entry**:
One item in a Game's Roster: a name, a photo and a value per Attribute. Replaces "Pet" (the old Petdle word). Entry ids are numeric and never reused. Deleting an Entry is soft: it leaves autocomplete and future draws, but past Guesses and Daily Answers still resolve.

**Roster**:
The list of a Game's active Entries. A Game is playable with at least 2.

**Guess**:
An Entry the player submits as their attempt at the Daily Answer.

**Daily Answer**:
The one Entry chosen for a given calendar date in a Game. Every player gets the same Daily Answer on the same date.

**Answer History**:
The stored Daily Answers of a Game from its start date onward, one per calendar date in the server time zone, drawn at random on first request and stored. Past days never change.

**Skip Period**:
The number of most recent daily answers that cannot be chosen again, including across consecutive days. Per Game: default 5, at most one less than the number of active Entries.

**Attribute**:
A compared property of an Entry, such as colors or owners, defined per Game. Type **Text** holds one value, type **List** an ordered set of values. A Guess is graded per Attribute as correct, partially correct, or incorrect.

**Correctness**:
How well one attribute of a guess matches the Daily Answer: correct, partially correct, or incorrect. Text: correct only on an exact match. List: correct on the same set, partially correct when at least one value is shared, otherwise incorrect. Empty equals empty. Grades are never stored, so a schema edit regrades live.

**Game State**:
What is remembered about today: the Guesses made (as Entry ids), whether the player gave up, and the day last played. Anonymous players keep it in the browser (`localStorage`). Signed-in players keep it on the server, so it follows them across devices. Victory is never stored: it is derived from the Guesses and the current Daily Answer. It resets on a new calendar day, or when the player resets at any time once they have made a Guess (the Daily Answer stays the same). On first login, leftover browser guesses are merged into the account only if the account has no progress that day; otherwise the server state wins.

**Override**:
An Owner's or Admin's choice of Daily Answer for today or a future day, replacing the generated one. Past days cannot be overridden. Setting or clearing an Override re-draws every later generated day; overridden days are never re-drawn.

**Admin**:
A signed-in user with the admin flag. Admins get an Admin link in the account menu and use the admin page (`/admin`): the approval queue, all Games, users (promote or demote, never oneself or the last Admin) and backups. They can also edit any Game. Emails in `ADMIN_EMAILS` become Admins on login.

**Day Number**:
Whole calendar days since the game's start date. The start date itself is day 0. Each Day Number maps to exactly one Daily Answer.
