type Handler = (args: unknown) => unknown | Promise<unknown>;
interface Action {
  handler: Handler;
  description: string;
  sideEffects: string;
}
const actions = new Map<string, Action>();
const scopes = new Map<string, Handler>();

/** Register a focused development adapter that calls the module's existing business entry point. */
export function registerDevAction(
  name: string,
  handler: Handler,
  metadata: { description: string; sideEffects: string }
): () => void {
  if (actions.has(name)) throw new Error(`DUPLICATE_ACTION: ${name}`);
  const action = { handler, ...metadata };
  actions.set(name, action);
  return () => {
    if (actions.get(name) === action) actions.delete(name);
  };
}
export function registerDevState(name: string, handler: Handler): () => void {
  if (scopes.has(name)) throw new Error(`DUPLICATE_SCOPE: ${name}`);
  scopes.set(name, handler);
  return () => {
    if (scopes.get(name) === handler) scopes.delete(name);
  };
}
export function describeCapabilities() {
  return {
    scopes: [...scopes.keys()],
    actions: [...actions].map(([name, action]) => ({
      name,
      description: action.description,
      sideEffects: action.sideEffects,
    })),
  };
}
export async function readDevState(scope: string): Promise<unknown> {
  const handler = scopes.get(scope);
  if (!handler) throw new Error(`UNKNOWN_SCOPE: ${scope}`);
  return handler(undefined);
}
export async function runDevAction(
  name: string,
  args: unknown
): Promise<unknown> {
  const action = actions.get(name);
  if (!action) throw new Error(`UNKNOWN_ACTION: ${name}`);
  return action.handler(args);
}
