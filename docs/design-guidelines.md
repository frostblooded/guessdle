# Design guidelines

How to place and style UI in Guessdle. Every UI change follows these (CLAUDE.md "Working rules"). The look itself ("Classic, refined": typewriter font, big centred title, dark slate grid headers) stays as it is; these rules decide where things go and how much weight they get.

## Focus

- Each page has one main task, and it gets the most visual weight. On a game page that is the guess input and the guesses already tried. Everything else is quieter and takes less room above them.
- Use at most three type sizes on a page, and make the most important thing the biggest. Use colour and contrast to rank things, not more sizes.
- Keep only one or two prominent (filled) buttons per view. Everything else is outline, ghost or a link.
- On a phone, the main task should start within the first screen. Don't stack page chrome above it.

## Grouping and placement

- Put an action next to the thing it acts on. Controls far from their object get overlooked (the player's "tunnel vision" on the task).
- Group related controls with whitespace first. Use a container (card, border, background) only when whitespace cannot separate the groups, since every box adds clutter.
- Order groups by purpose, not by when the feature shipped. Actions about the current round sit with the round; actions about the game as a whole (past days, party, save, edit) sit with the game's title.
- Within a bar, align primary groups to the start (left) and utility icons to the end (right). Keep each group's position stable when some buttons are hidden for some players.

## Risky actions

- Keep consequential actions (give up, reset, delete, leave) apart from benign ones, with extra space or a different place, and make them look different (quieter style, icon, colour). Never put one right next to the primary button.
- Never give a destructive action the primary (filled) style. Ask for confirmation when it cannot be undone.

## Icons and labels

- Use icon-only buttons only for symbols players already know (pencil = edit, bookmark = save, X = close). When in doubt, use a short text label.
- Every icon-only button has an accessible name that says the action (`aria-label="Edit game"`, not "pencil") and a hover tooltip (`title`) with the same words. Decorative icons next to text get `aria-hidden="true"`.

## Touch and spacing

- Touch targets are at least 44 px on phones; keep enough space around buttons that they are easy to tell apart.
- Never leave controls flush against each other; match the gaps the site already uses (CLAUDE.md spacing rule).
- Check every layout on phone and desktop, light and dark, with `npm run shot` before shipping. Check with realistic data (a few guesses on the board, long names), not only an empty page.

## Sources

- NN/g, [Proximity principle in visual design](https://www.nngroup.com/articles/gestalt-proximity/)
- NN/g, [Closeness of actions and objects in GUI design](https://www.nngroup.com/articles/closeness-of-actions-and-objects-gui/)
- NN/g, [Consequential options close to benign options](https://www.nngroup.com/articles/proximity-consequential-options/)
- NN/g, [The principle of common region](https://www.nngroup.com/articles/common-region/)
- NN/g, [5 principles of visual design in UX](https://www.nngroup.com/articles/principles-visual-design/)
- Sara Soueidan, [Accessible icon buttons](https://www.sarasoueidan.com/blog/accessible-icon-buttons/)
- Apple, [Human Interface Guidelines: Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)
