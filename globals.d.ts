// Typings for @tarekraafat/autocomplete.js (ships none) and its CSS import.

declare module "@tarekraafat/autocomplete.js" {
  export interface AutoCompleteItem {
    value: string;
  }

  export interface AutoCompleteResults {
    query: string;
    results: AutoCompleteItem[];
  }

  export interface AutoCompleteSelectionEvent extends Event {
    detail: { selection: AutoCompleteItem };
  }

  export interface AutoCompleteConfig {
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

  export default class autoComplete {
    constructor(config: AutoCompleteConfig);
    close(): void;
  }
}

declare module "*.css";
