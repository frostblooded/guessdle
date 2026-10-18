// The guess input: a Downshift combobox over the roster's names, without the ones already guessed.
import { useCombobox } from "downshift";
import { Input } from "../../components/ui/input.tsx";
import { cn } from "../../lib/utils.ts";

// Names containing the typed text, any letter case (as autocomplete.js matched before)
export function matchNames(names: readonly string[], query: string): string[] {
  const lower = query.trim().toLowerCase();
  return lower === ""
    ? []
    : names.filter((name) => name.toLowerCase().includes(lower));
}

export function GuessBox({
  names,
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  names: readonly string[];
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  const items = matchNames(names, value);
  const {
    isOpen,
    highlightedIndex,
    getLabelProps,
    getInputProps,
    getMenuProps,
    getItemProps,
  } = useCombobox({
    items,
    inputValue: value,
    // Never "selected": picking a name only fills the box, and the same name can be picked again
    selectedItem: null,
    inputId: "new-guess-input",
    menuId: "guess-options",
    getItemId: (index) => `guess-option-${index}`,
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) {
        onChange(selectedItem);
      }
    },
  });
  const open = isOpen && value.trim() !== "";

  return (
    <div className="relative min-w-0 flex-1">
      <label {...getLabelProps({ className: "sr-only" })}>Name</label>
      <Input
        {...getInputProps({
          disabled,
          placeholder: "Guess a name...",
          autoComplete: "off",
          autoCapitalize: "off",
          spellCheck: false,
          // Typing sets the text at once: Downshift reports changes after the render, which drops fast keystrokes
          onChange: (event) => onChange(event.currentTarget.value),
          onKeyDown: (event) => {
            // Enter with nothing highlighted submits what is typed
            if (event.key === "Enter" && (!open || highlightedIndex < 0)) {
              event.preventDefault();
              onSubmit();
            }
          },
        })}
        className="h-11 text-base"
      />
      <ul
        {...getMenuProps()}
        hidden={!open}
        className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-card p-1 shadow-lg"
      >
        {open &&
          items.map((name, index) => (
            <li
              key={name}
              {...getItemProps({ item: name, index })}
              className={cn(
                "cursor-pointer rounded-md bg-card px-3 py-2 text-sm text-foreground",
                highlightedIndex === index &&
                  "bg-accent text-accent-foreground",
              )}
            >
              {name}
            </li>
          ))}
        {open && items.length === 0 && (
          <li className="no_result bg-card px-3 py-2 text-sm text-muted-foreground">
            Found No Results for &quot;{value}&quot;
          </li>
        )}
      </ul>
    </div>
  );
}
