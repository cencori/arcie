import type { SelectOption } from "./prompter";

export interface SelectState<T = string> {
  readonly options: readonly SelectOption<T>[];
  readonly matches: readonly SelectOption<T>[];
  readonly selectedIndex: number;
  readonly query: string;
}

export interface CreateSelectStateOptions<T> {
  readonly initialValue?: T;
  readonly query?: string;
}

export function createSelectState<T>(
  options: readonly SelectOption<T>[],
  init: CreateSelectStateOptions<T> = {},
): SelectState<T> {
  const query = init.query ?? "";
  const matches = filterOptions(options, query);
  const initial = init.initialValue;
  const selectedIndex =
    initial === undefined
      ? 0
      : Math.max(
          0,
          matches.findIndex((option) => option.value === initial),
        );
  return { options, matches, selectedIndex, query };
}

export function setQuery<T>(state: SelectState<T>, query: string): SelectState<T> {
  if (query === state.query) return state;
  const matches = filterOptions(state.options, query);
  const carried = state.matches[state.selectedIndex];
  const carriedIndex =
    carried === undefined
      ? -1
      : matches.findIndex((option) => option.value === carried.value);
  return {
    options: state.options,
    matches,
    selectedIndex: carriedIndex >= 0 ? carriedIndex : 0,
    query,
  };
}

export function moveUp<T>(state: SelectState<T>): SelectState<T> {
  const count = state.matches.length;
  if (count === 0) return state;
  const selectedIndex = (state.selectedIndex - 1 + count) % count;
  return { ...state, selectedIndex };
}

export function moveDown<T>(state: SelectState<T>): SelectState<T> {
  const count = state.matches.length;
  if (count === 0) return state;
  const selectedIndex = (state.selectedIndex + 1) % count;
  return { ...state, selectedIndex };
}

export function selected<T>(state: SelectState<T>): SelectOption<T> | undefined {
  return state.matches[state.selectedIndex];
}

function filterOptions<T>(
  options: readonly SelectOption<T>[],
  query: string,
): readonly SelectOption<T>[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return options;
  return options.filter((option) => optionMatches(option, normalized));
}

function optionMatches<T>(option: SelectOption<T>, query: string): boolean {
  if (option.label.toLowerCase().includes(query)) return true;
  if (option.description !== undefined && option.description.toLowerCase().includes(query)) {
    return true;
  }
  return false;
}
