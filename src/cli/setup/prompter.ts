export interface SelectOption<T = string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
}

export interface TextPromptOptions {
  readonly message: string;
  readonly placeholder?: string;
  readonly defaultValue?: string;
  readonly mask?: boolean;
  readonly validate?: (value: string) => string | undefined;
}

export interface SelectPromptOptions<T = string> {
  readonly message: string;
  readonly options: readonly SelectOption<T>[];
  readonly initialValue?: T;
}

export interface SearchableSelectPromptOptions<T = string> extends SelectPromptOptions<T> {
  readonly placeholder?: string;
}

export interface AcknowledgePromptOptions {
  readonly message: string;
  readonly lines?: readonly string[];
}

export interface SpinnerHandle {
  update(message: string): void;
  stop(outcome?: SpinnerOutcome): void;
}

export type SpinnerOutcome =
  | { kind: "success"; message?: string }
  | { kind: "warning"; message?: string }
  | { kind: "error"; message?: string }
  | { kind: "silent" };

export interface PrompterLog {
  info(message: string): void;
  success(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

export interface Prompter {
  text(options: TextPromptOptions): Promise<string | undefined>;
  select<T>(options: SelectPromptOptions<T>): Promise<T | undefined>;
  searchableSelect<T>(options: SearchableSelectPromptOptions<T>): Promise<T | undefined>;
  acknowledge(options: AcknowledgePromptOptions): Promise<void>;
  spinner(message: string): SpinnerHandle;
  section(title: string, lines: readonly string[]): void;
  readonly log: PrompterLog;
  stop(): void;
}
