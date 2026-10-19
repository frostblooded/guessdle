// The result screens' Friends list: how each friend who played did, best first.

export function FriendResults({
  rows,
}: {
  rows: readonly { name: string; result: string }[];
}) {
  return (
    <figure id="friend-results" className="flex flex-col gap-2">
      <figcaption className="text-sm font-bold uppercase">Friends</figcaption>
      <ol className="divide-y rounded-lg border">
        {rows.map((row, i) => (
          <li
            key={row.name}
            className="friend-result flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <span className="min-w-0 break-all">
              <span className="mr-2 text-muted-foreground tabular-nums">
                {i + 1}.
              </span>
              {row.name}
            </span>
            <span className="shrink-0 text-right font-semibold tabular-nums">
              {row.result}
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
