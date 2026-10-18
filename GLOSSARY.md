# Guessdle

A site of daily guessing games. Players guess the answer of the day in a game by comparing attributes.

## Language

**Game**:
One guessing game: a name, a cover image, attribute definitions and a roster of entries. Has its own Daily Answers. Created by a signed-in user (its **Owner**), or ownerless (the original Petdle game, editable only by Admins).

**Approval**:
An Admin's sign-off that lets a Game appear in the front-page gallery. Unapproved Games stay reachable by link. Editing the text or images of an approved Game resets it to pending.

**Owner**:
The signed-in user who created a Game. Owners and Admins edit the Game, set its Overrides, submit, unpublish and delete it. Deleting a user deletes their Games.

**Kind**:
A Game is **Classic** (guessed by comparing Attributes) or **Blur** (guessed from a blurred image). Chosen when the Game is created; it never changes.

**Square Order**:
The order a Blur Game Entry's nine image squares clear in, picked by the Owner. Only the first square is clear at first; each wrong Guess clears the next. The Game sets the tries (1 to 9): a wrong Guess on the last one loses the day.

**Draft**:
A Game's first status. Only its Owner and Admins can see it (everyone else gets a 404) until it is submitted. Statuses: draft, pending, approved, rejected.

**Entry**:
One item in a Game's Roster: a name and a value per Attribute (a Blur game's Entry: a name, an image and a square order). Pictures are Image Attribute values; an Entry's photo, where one picture stands for it (guess suggestions, the result card, party rounds), is its first non-blank Image value. Replaces "Pet" (the old Petdle word). Entry ids are numeric and never reused. Deleting an Entry is soft: it leaves autocomplete and future draws, but past Guesses and Daily Answers still resolve.

**Roster**:
The list of a Game's active Entries. A Game is playable with at least 2.

**Paused**:
A Game with an active Entry missing a value (after a new Attribute, or a type change). Nobody can play it, start a Party on it or submit it, and it leaves the gallery, until every Entry is filled in.

**Guess**:
An Entry the player submits as their attempt at the Daily Answer.

**Daily Answer**:
The one Entry chosen for a given calendar date in a Game. Every player gets the same Daily Answer on the same date.

**Answer History**:
The stored Daily Answers of a Game from its start date onward, one per calendar date in the server time zone, drawn at random on first request and stored. Past days never change.

**Skip Period**:
The number of most recent daily answers that cannot be chosen again, including across consecutive days. Per Game: default 5, at most one less than the number of active Entries.

**Attribute**:
A compared property of an Entry, such as colors or owners, defined per Game. Type **Text** holds one value, type **List** an ordered set of values, type **Number** one number (decimals and negatives allowed). Every Entry needs a value for every Attribute. A Guess is graded per Attribute as correct, partially correct, or incorrect. Owners edit the Attributes as a list that only lands on Save; removing an Attribute or changing its type erases its values from every Entry.

**Correctness**:
How well one attribute of a guess matches the Daily Answer: correct, partially correct, or incorrect. Text: correct only on an exact match. List: correct on the same set, partially correct when at least one value is shared, otherwise incorrect. Number: correct on the same value, otherwise incorrect with a **Hint** (↑ the answer is higher, ↓ lower). Empty equals empty. Grades are never stored, so a schema edit regrades live.

**Game State**:
What is remembered about today: the Guesses made (as Entry ids), whether the player gave up, and the day last played. Anonymous players keep it in the browser (`localStorage`). Signed-in players keep it on the server, so it follows them across devices. Victory is never stored: it is derived from the Guesses and the current Daily Answer. It resets on a new calendar day, or when the player resets at any time once they have made a Guess (the Daily Answer stays the same). On first login, leftover browser guesses are merged into the account only if the account has no progress that day; otherwise the server state wins.

**Past Day**:
An earlier day of a Game (Day Number 0 up to yesterday), played from the Past days list at `/g/<slug>/day/<n>` against that day's stored Daily Answer. Each Past Day keeps its own Game State, which never expires: signed in on the server, anonymous in the browser. A finished Past Day can be reset like today. The first win on a Past Day counts in that day's stats, as if played on the day (decided 2026-10-18); later wins after a reset change nothing, and so do wins after a first attempt that failed (a give-up or used-up tries). Browser guesses of a Past Day are never merged into the account.

**Override**:
An Owner's or Admin's choice of Daily Answer for today or a future day, replacing the generated one. Past days cannot be overridden. Setting or clearing an Override re-draws every later generated day; overridden days are never re-drawn.

**Admin**:
A signed-in user with the admin flag. Admins get an Admin link in the account menu and use the admin page (`/admin`): the approval queue, all Games, users (promote or demote, never oneself or the last Admin) and backups. They can also edit any Game. Emails in `ADMIN_EMAILS` become Admins on login.

**Day Number**:
Whole calendar days since the game's start date. The start date itself is day 0. Each Day Number maps to exactly one Daily Answer.

**Username**:
A signed-in player's one public name, picked once (lowercase letters, digits, underscores). Their **Profile** at `/u/<username>` shows their Playlists and their gallery Games. The account's `name` is its email and is never shown publicly.

**Playlist**:
A player's named, ordered list of Games, public (anyone with the link, and on their Profile) or private (only them). Only Games the gallery shows can be added, and a Game that leaves the gallery drops out of view until it returns.

**Party**:
A live competition on one Game, opened by a signed-in **Host**, that friends join from their phones with a 4-letter code (ADR 0016). It runs any number of **Rounds** and ends when the Host ends it or after 12 idle hours; its results stay at its link for 30 days.

**Party Player**:
Someone in a Party, known by a nickname and a token on their phone; the Host is one too. Guests need no account.

**Round**:
One secret Entry in a Party, drawn at random for it (never the Daily Answer). Fewest guesses wins, ties broken by time from the round's start. It ends when every player has solved it or given up, or when the Host ends it.

**Placement Points**:
What a Round gives: with N players, 1st gets N points, 2nd N - 1, and so on; unsolved gets 0. A Party's standings add them up.
