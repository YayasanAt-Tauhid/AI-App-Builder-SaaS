/**
 * cf-stubs.d.ts — Minimal ambient declarations of the Cloudflare binding APIs
 * the cf/* adapters use. NOT shipped and NOT part of the production typecheck:
 * it exists only so `tsconfig.worker-lite.json` can type-check the CF code
 * quickly in environments where loading the full @cloudflare/workers-types is
 * too heavy. The real types come from @cloudflare/workers-types at deploy time
 * (see tsconfig.worker.json); these shapes mirror that public API.
 */

declare module "@cloudflare/workers-types" {
  export interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{ results: T[] }>;
    run(): Promise<unknown>;
  }
  export interface D1Database {
    prepare(query: string): D1PreparedStatement;
  }

  export interface R2Object {
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
  }
  export interface R2Bucket {
    put(key: string, value: string | Uint8Array | ArrayBuffer, options?: { httpMetadata?: { cacheControl?: string } }): Promise<unknown>;
    get(key: string): Promise<R2Object | null>;
    head(key: string): Promise<unknown | null>;
    delete(key: string): Promise<void>;
  }

  export interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  }

  export interface Queue<T = unknown> {
    send(message: T): Promise<void>;
  }

  export interface DurableObjectId {}
  export interface DurableObjectStub {}
  export interface DurableObjectNamespace {
    idFromName(name: string): DurableObjectId;
    get(id: DurableObjectId): DurableObjectStub;
  }
  export interface DurableObjectState {}

  export interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
  }

  export interface Message<T = unknown> {
    body: T;
    ack(): void;
    retry(): void;
  }
  export interface MessageBatch<T = unknown> {
    messages: Message<T>[];
  }
}

declare module "cloudflare:workers" {
  export class DurableObject<Env = unknown> {
    constructor(ctx: import("@cloudflare/workers-types").DurableObjectState, env: Env);
    protected ctx: import("@cloudflare/workers-types").DurableObjectState;
    protected env: Env;
  }
}
