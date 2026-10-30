import { AsyncLocalStorage } from "node:async_hooks";

export interface TestCookie {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

export interface TestCookieStore {
  get(name: string): TestCookie | undefined;
  getAll(): TestCookie[];
  set(name: string, value: string, options?: Record<string, unknown>): void;
  delete(name: string): void;
  has(name: string): boolean;
}

export function createCookieStore(initial: Record<string, string> = {}): TestCookieStore {
  const jar = new Map<string, TestCookie>();
  for (const [name, value] of Object.entries(initial)) jar.set(name, { name, value });
  return {
    get(name) {
      return jar.get(name);
    },
    getAll() {
      return [...jar.values()];
    },
    set(name, value, options) {
      jar.set(name, { name, value, options });
    },
    delete(name) {
      jar.delete(name);
    },
    has(name) {
      return jar.has(name);
    },
  };
}

const KEY = Symbol.for("votavia.qa.cookieAls");
const g = globalThis as unknown as { [KEY]?: AsyncLocalStorage<TestCookieStore> };
const ALS = (g[KEY] ??= new AsyncLocalStorage<TestCookieStore>());

export async function cookies() {
  const store = ALS.getStore();
  if (!store) {
    throw new Error(
      "No cookie store bound. Wrap route handler calls in withCookies(store, fn).",
    );
  }
  return store;
}

export function withCookies<T>(store: TestCookieStore, fn: () => Promise<T> | T): Promise<T> {
  return ALS.run(store, async () => fn());
}
