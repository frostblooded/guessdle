// Typings for the vendored libs in libs/, which are loaded as plain globals.

interface AutoCompleteItem {
  value: string;
}

interface AutoCompleteResults {
  query: string;
  results: AutoCompleteItem[];
}

interface AutoCompleteSelectionEvent extends Event {
  detail: { selection: AutoCompleteItem };
}

interface AutoCompleteConfig {
  selector: string;
  placeHolder?: string;
  data: {
    src: string[];
    filter?: (list: AutoCompleteItem[]) => AutoCompleteItem[];
  };
  resultsList?: {
    element?: (list: HTMLElement, data: AutoCompleteResults) => void;
    noResults?: boolean;
  };
  resultItem?: { highlight?: boolean };
  events?: {
    input?: Record<string, (event: AutoCompleteSelectionEvent) => void>;
  };
}

declare class autoComplete {
  constructor(config: AutoCompleteConfig);
  close(): void;
}

interface Math {
  seedrandom: new (seed?: string) => () => number;
}
