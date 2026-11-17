# Feature map

Every user-facing feature, by page, with the names to use for it (terms from `GLOSSARY.md`), where its code lives and which tests cover it. Use these names when you talk about a feature, so "the thing under the board" is always "the Free Hint". `tests/feature-map.test.ts` checks that every route in `src/App.tsx` has a section here, that every path named here exists, and that every e2e spec and UI test belongs to some feature. Add a line when you add a feature.

## Every page

- **Header**: brand link to the gallery, Main nav (Games, How to play), Theme button, Sign in link or Account menu (Admin link for admins, Friends badge, Sign out). Code: `src/components/layout.tsx`, `src/components/account-area.tsx`, `src/components/theme-button.tsx`. Tests: `tests/e2e/navigation.spec.ts`, `tests/e2e/account.spec.ts`, `tests/e2e/theme.spec.ts`, `tests/ui/account-area.test.tsx`, `tests/ui/theme-button.test.tsx`.
- **Maintenance page**: shown to everyone but admins while Maintenance mode is on. Code: `src/routes/maintenance-page.tsx`. Tests: `tests/integration/maintenance.test.ts`.
- **Not found**: any unknown path, an unknown game or a hidden game. Code: `src/routes/not-found-page.tsx`. Tests: `tests/e2e/gallery.spec.ts`, `tests/e2e/server.spec.ts`.
- **Layout on phones**: every page fits a 320px phone without sideways scrolling. Tests: `tests/e2e/mobile-pages.spec.ts`, `tests/e2e/layout.spec.ts`.
- **Robustness**: no page error, console error, 5xx or blank page under random use. Tests: `tests/e2e/fuzz.spec.ts`.

## `/`

- **Gallery**: Petdle first and full width, then approved playable games newest first; each Game card names its Game Kind and has a Save button. Code: `src/routes/gallery-page.tsx`, `src/components/game-card.tsx`, `src/components/game-kind.tsx`. Tests: `tests/e2e/gallery.spec.ts`.

## `/g/:slug`

- **Play (Classic)**: the Guess box (Typing) or Select next guess list (Selecting), the Board with Name and Attribute columns colored correct, partly correct or wrong, Number hints, Image columns. Code: `src/routes/play/play-page.tsx`, `src/routes/play/guess-box.tsx`, `src/routes/play/select-list.tsx`, `src/components/board.tsx`. Tests: `tests/e2e/guess-flow.spec.ts`, `tests/e2e/number-attribute.spec.ts`, `tests/e2e/image-attribute.spec.ts`, `tests/ui/guess-box.test.tsx`, `tests/ui/play-page.test.tsx`.
- **Give up and Reset**: give up reveals the Daily Answer; Reset restarts the Board after a confirm (only the first try counts). Code: `src/routes/play/reset-dialog.tsx`, `src/routes/play/use-play-board.ts`. Tests: `tests/e2e/guess-flow.spec.ts`.
- **Free Hint**: after three wrong guesses, reveal one unmatched Attribute once a day. Code: `src/routes/play/free-hint.tsx`. Tests: `tests/ui/free-hint.test.tsx`.
- **Result banner and Victory stats**: the win popup with guesses, time and the day's charts, friends' first tries, "only your first try counts". Code: `src/routes/play/result-banner.tsx`, `src/routes/play/stats-dialog.tsx`, `src/components/friend-results.tsx`. Tests: `tests/ui/stats-dialog.test.tsx`, `tests/ui/play-results.test.tsx`.
- **Signed-in play**: guesses live on the account, survive reloads and other devices; guest guesses merge in at sign-in. Code: `src/game/server-play.ts`, `src/game/merge.ts`. Tests: `tests/e2e/signed-in-game.spec.ts`, `tests/e2e/email-login.spec.ts`, `tests/e2e/rate-limit.spec.ts`.
- **Blur game**: a 3x3 grid that clears one square per wrong guess, Skip. Code: `src/components/blur-view.tsx`, `src/components/skip-button.tsx`. Tests: `tests/e2e/blur-game.spec.ts`.
- **Sequence game**: one more photo per wrong guess. Code: `src/components/sequence-view.tsx`. Tests: `tests/e2e/sequence-game.spec.ts`, `tests/ui/sequence-play.test.tsx`.
- **Quiz game**: answer every question, then the review with points and the score spread. Code: `src/routes/play/quiz-play.tsx`. Tests: `tests/e2e/quiz-game.spec.ts`.
- **Game status and review buttons**: owners and admins see Draft, Pending, Rejected; admins Approve or Reject with "See changes". Code: `src/routes/play/play-status.tsx`, `src/components/review-buttons.tsx`, `src/components/changes-dialog.tsx`. Tests: `tests/e2e/play-status.spec.ts`, `tests/ui/review-buttons.test.tsx`, `tests/ui/changes-dialog.test.tsx`.

## `/g/:slug/days`

- **Past days**: every day newest first with the player's status. Code: `src/routes/play/days-page.tsx`, `src/routes/play/day-list.tsx`. Tests: `tests/e2e/past-days.spec.ts`, `tests/ui/days-page.test.tsx`.

## `/g/:slug/day/:day`

- **Past Day**: Play on an earlier day; its first win counts in that day's stats. Code: `src/routes/play/past-day.tsx`. Tests: `tests/e2e/past-days.spec.ts`.

## `/g/:slug/edit`

- **Editor**: Details, Entries, Attributes, Answers, Questions tabs and the status bar to submit for approval or unpublish. Code: `src/routes/edit/edit-page.tsx`, `src/routes/edit/status-bar.tsx`. Tests: `tests/e2e/approval.spec.ts`, `tests/e2e/review.spec.ts`.
- **Entries tab**: add, edit and delete Entries in a popup, photos with the Crop dialog, Blur order, Sequence photos. Code: `src/routes/edit/entries-panel.tsx`, `src/components/crop-dialog.tsx`, `src/routes/edit/blur-order-editor.tsx`, `src/routes/edit/shots-editor.tsx`. Tests: `tests/e2e/entries.spec.ts`, `tests/e2e/crop.spec.ts`.
- **Attributes tab**: add, reorder, retype and remove Attributes; saves only on Save. Code: `src/routes/edit/attributes-panel.tsx`. Tests: `tests/e2e/attributes.spec.ts`.
- **Answers tab**: the schedule of Daily Answers and owner overrides. Code: `src/routes/edit/answers-panel.tsx`, `src/routes/edit/override-dialog.tsx`. Tests: `tests/e2e/answers.spec.ts`.
- **Questions tab**: Quiz questions, multiple choice or number. Code: `src/routes/edit/questions-panel.tsx`. Tests: `tests/e2e/quiz-game.spec.ts`.

## `/create`

- **Create a game**: name and Game Kind, then the editor as a draft; guests sign in first. Code: `src/routes/create-page.tsx`. Tests: `tests/e2e/create-game.spec.ts`.

## `/my-games`

- **My games**: the player's own games with status, Edit and Delete. Code: `src/routes/my-games-page.tsx`. Tests: `tests/e2e/delete.spec.ts`.

## `/how-to-play`

- **How to play**: an accordion per Game Kind with practice rounds on a frozen Petdle copy. Code: `src/routes/how-to-play-page.tsx`, `src/routes/how-to-play/practice-game.tsx`, `src/routes/how-to-play/picture-practice.tsx`, `src/routes/how-to-play/quiz-practice.tsx`. Tests: `tests/ui/how-to-play.test.tsx`.

## `/settings`

- **Settings**: Username, approval and friend request email switches. Code: `src/routes/settings-page.tsx`, `src/components/username-form.tsx`. Tests: `tests/ui/settings-page.test.tsx`, `tests/e2e/mobile-pages.spec.ts`.

## `/friends`

- **Friends**: add by exact username or email, accept, decline, cancel, remove. Code: `src/routes/friends-page.tsx`. Tests: `tests/e2e/friends.spec.ts`.

## `/login`

- **Sign in**: one email field; the magic link signs in or signs up. Code: `src/routes/login-page.tsx`. Tests: `tests/e2e/email-login.spec.ts`.

## `/verify`

- **Verify link**: opens the emailed link, then returns to where the player was. Code: `src/routes/verify-page.tsx`. Tests: `tests/e2e/email-login.spec.ts`.

## `/admin`

- **Admin**: Review queue, All games, Users (ban), Backup status, Maintenance switch. Code: `src/routes/admin/admin-page.tsx`, `src/routes/admin/queue-panel.tsx`, `src/routes/admin/games-panel.tsx`, `src/routes/admin/users-panel.tsx`, `src/routes/admin/backup-panel.tsx`, `src/routes/admin/maintenance-panel.tsx`. Tests: `tests/e2e/admin.spec.ts`, `tests/e2e/review.spec.ts`, `tests/e2e/backup.spec.ts`, `tests/e2e/delete.spec.ts`.

## `/party`

- **Host or join a Party**: a host picks a game and gets a code and QR; players join by code. Code: `src/routes/party/party-page.tsx`, `src/routes/party/party-forms.tsx`. Tests: `tests/e2e/party.spec.ts`.

## `/party/:code`

- **Party room and rounds**: lobby, live Party Rounds per Game Kind, standings and the podium; the host removes players. Code: `src/routes/party/party-room.tsx`, `src/routes/party/party-round.tsx`, `src/routes/party/quiz-round.tsx`, `src/routes/party/standings.tsx`. Tests: `tests/e2e/party.spec.ts`, `tests/e2e/blur-game.spec.ts`, `tests/e2e/quiz-game.spec.ts`.

## `/profile`

- **Own Profile**: the player's playlists and games. Code: `src/routes/playlists/profile-page.tsx`. Tests: `tests/e2e/playlists.spec.ts`.

## `/u/:username`

- **Profile**: a player's public playlists and gallery games. Code: `src/routes/playlists/profile-page.tsx`. Tests: `tests/e2e/playlists.spec.ts`.

## `/p/:id`

- **Playlist**: its games in order; Save to playlist from any Game card. Code: `src/routes/playlists/playlist-page.tsx`, `src/components/save-to-playlist.tsx`. Tests: `tests/e2e/playlists.spec.ts`.

## `/p/:id/edit`

- **Edit playlist**: rename, reorder, make public or private, delete. Code: `src/routes/playlists/playlist-edit-page.tsx`. Tests: `tests/e2e/playlists.spec.ts`.

## Behind the pages

- **Delayed spinners**: loading states show only after a short delay. Code: `src/lib/use-delayed.ts`. Tests: `tests/ui/use-delayed.test.tsx`.
