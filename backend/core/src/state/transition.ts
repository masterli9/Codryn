export type TransitionResult<State extends string> =
  | { readonly ok: true; readonly state: State }
  | {
      readonly ok: false;
      readonly code: 'INVALID_STATE_TRANSITION';
      readonly from: State;
      readonly to: State;
    };

export function transition<State extends string>(
  graph: Readonly<Record<State, readonly State[]>>,
  from: State,
  to: State
): TransitionResult<State> {
  return graph[from].includes(to)
    ? { ok: true, state: to }
    : { ok: false, code: 'INVALID_STATE_TRANSITION', from, to };
}
