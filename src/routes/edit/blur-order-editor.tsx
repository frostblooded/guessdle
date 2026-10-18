// The editor's square order for one Blur game entry (ADR 0019): the entry's image split into the
// 3x3 grid. Click the squares in the order players should see them clear; the first one is clear
// from the start. Clicking a numbered square takes it out again.
import { Button } from "../../components/ui/button.tsx";
import { CELLS, GRID, toggleCell } from "../../game/blur.ts";
import { cn } from "../../lib/utils.ts";

export function BlurOrderEditor({
  src,
  order,
  onChange,
}: {
  src: string;
  // The squares picked so far, first cleared first
  order: readonly number[];
  onChange: (order: number[]) => void;
}) {
  const done = order.length === CELLS;
  return (
    <div id="blur-order" className="space-y-3">
      <div
        className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-lg border bg-muted select-none"
        role="group"
        aria-label="Square order"
      >
        <img
          id="blur-image"
          className="absolute inset-0 size-full object-cover"
          src={src}
          alt=""
          draggable={false}
        />
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: `repeat(${GRID}, 1fr)`,
            gridTemplateRows: `repeat(${GRID}, 1fr)`,
          }}
        >
          {Array.from({ length: CELLS }, (_, cell) => {
            const place = order.indexOf(cell);
            return (
              <button
                key={cell}
                type="button"
                data-cell={cell}
                aria-label={
                  place === -1
                    ? `Square ${cell + 1}, not picked`
                    : `Square ${cell + 1}, clears ${place + 1}`
                }
                className={cn(
                  "blur-cell flex items-center justify-center border border-white/70 text-2xl font-bold text-white transition-colors",
                  place === -1
                    ? "bg-black/45 backdrop-blur-sm hover:bg-black/30"
                    : "bg-transparent [text-shadow:0_0_4px_rgba(0,0,0,0.9)]",
                )}
                onClick={() => onChange(toggleCell(order, cell))}
              >
                {place === -1 ? "" : place + 1}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          id="blur-order-hint"
          className="text-sm text-muted-foreground"
          aria-live="polite"
        >
          {done
            ? "Order set. Square 1 is clear from the start; each wrong guess clears the next."
            : order.length === 0
              ? "Click the square players see clear first, then the next, and so on."
              : `Pick square ${order.length + 1} of ${CELLS}.`}
        </p>
        {order.length > 0 && (
          <Button
            id="blur-order-clear"
            variant="ghost"
            size="sm"
            onClick={() => onChange([])}
          >
            Start over
          </Button>
        )}
      </div>
    </div>
  );
}
