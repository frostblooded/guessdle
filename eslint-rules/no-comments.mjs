const ALLOWED =
  /^\s*(shortcut:|eslint-disable|eslint-enable|@ts-expect-error|@ts-ignore|@ts-nocheck|prettier-ignore|global\s|<reference\s)/;

const isAllowed = (comment) =>
  ALLOWED.test(comment.value) || /^\/\s*<reference\s/.test(comment.value);

export default {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description:
        "Bans code comments in src/ except shortcut: debt notes and tool directives.",
    },
    messages: {
      comment:
        "Comments go stale and are not enforced, so src/ has none. Say it in code instead: a clearer name, a type, a test (the test's name is the rule), or docs/architecture.md and GLOSSARY.md for the why. A known shortcut stays as a `shortcut:` comment; tool directives (eslint-disable, @ts-expect-error) stay too.",
    },
    schema: [],
  },
  create(context) {
    const source = context.sourceCode;
    const text = source.getText();
    return {
      Program() {
        for (const comment of source.getAllComments()) {
          if (isAllowed(comment)) {
            continue;
          }
          let [start, end] = comment.range;
          let before = start;
          while (before > 0 && /[ \t]/.test(text[before - 1])) {
            before--;
          }
          let after = end;
          while (after < text.length && /[ \t]/.test(text[after])) {
            after++;
          }
          // A JSX comment {/* ... */} goes with its braces
          if (text[before - 1] === "{" && text[after] === "}") {
            start = before - 1;
            end = after + 1;
            before = start;
            while (before > 0 && /[ \t]/.test(text[before - 1])) {
              before--;
            }
            after = end;
            while (after < text.length && /[ \t]/.test(text[after])) {
              after++;
            }
          }
          const ownLine =
            (before === 0 || text[before - 1] === "\n") &&
            (after === text.length || text[after] === "\n");
          const range = ownLine
            ? [before, Math.min(after + 1, text.length)]
            : [before, end];
          context.report({
            loc: comment.loc,
            messageId: "comment",
            fix: (fixer) => fixer.removeRange(range),
          });
        }
      },
    };
  },
};
