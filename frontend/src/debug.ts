/** In-app error terminal: collects app logs, tool calls, API errors, console errors and uncaught exceptions. */
export type Level = "info" | "warn" | "error";
export interface Entry {
  t: number;
  level: Level;
  source: string;
  msg: string;
}
type Listener = (entries: Entry[]) => void;

export function fmt(x: unknown): string {
  if (x instanceof Error) return x.stack || `${x.name}: ${x.message}`;
  if (typeof x === "string") return x;
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

class Debug {
  entries: Entry[] = [];
  private listeners = new Set<Listener>();
  private scheduled = false;
  private installed = false;

  private push(level: Level, source: string, msg: string) {
    this.entries = [...this.entries.slice(-400), { t: Date.now(), level, source, msg }];
    if (this.scheduled) return;
    this.scheduled = true;
    // notify asynchronously so logging during a React render can never loop
    setTimeout(() => {
      this.scheduled = false;
      this.listeners.forEach((l) => l(this.entries));
    }, 0);
  }

  info(source: string, msg: string) {
    this.push("info", source, msg);
  }
  warn(source: string, msg: string) {
    this.push("warn", source, msg);
  }
  error(source: string, msg: string) {
    this.push("error", source, msg);
  }

  clear() {
    this.entries = [];
    this.listeners.forEach((l) => l(this.entries));
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  text(): string {
    return this.entries
      .map((e) => `${new Date(e.t).toLocaleTimeString()} [${e.level.toUpperCase()}] ${e.source}: ${e.msg}`)
      .join("\n");
  }

  installGlobalHandlers() {
    if (this.installed) return;
    this.installed = true;
    window.addEventListener("error", (e) => this.error("app", `${e.message} (${e.filename}:${e.lineno})`));
    window.addEventListener("unhandledrejection", (e) => this.error("app", `Unhandled promise: ${fmt(e.reason)}`));
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    console.error = (...args: unknown[]) => {
      this.error("console", args.map(fmt).join(" "));
      origError(...args);
    };
    console.warn = (...args: unknown[]) => {
      this.warn("console", args.map(fmt).join(" "));
      origWarn(...args);
    };
  }
}

export const debug = new Debug();
