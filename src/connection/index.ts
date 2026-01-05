/**
 * Connection adapter for Mongoose.do - adapts mongoose.do for Cloudflare Workers with capnweb
 */

import { model as createModel, deleteModel, getModel, type ModelConstructor } from '../model/index.js'
import { Schema } from '../schema/index.js'

// ============ Cloudflare Workers Types ============

/**
 * Durable Object Namespace binding type
 * This is a simplified type - the actual type comes from @cloudflare/workers-types
 */
interface DurableObjectNamespace {
  newUniqueId(options?: { jurisdiction?: string }): DurableObjectId
  idFromName(name: string): DurableObjectId
  idFromString(id: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}

interface DurableObjectId {
  toString(): string
  equals(other: DurableObjectId): boolean
}

interface DurableObjectStub {
  id: DurableObjectId
  name?: string
  fetch(request: Request | string, init?: RequestInit): Promise<Response>
}

// ============ Types ============

/**
 * Connection ready states (compatible with Mongoose)
 */
export const STATES = {
  disconnected: 0,
  connected: 1,
  connecting: 2,
  disconnecting: 3,
} as const

export type ConnectionState = typeof STATES[keyof typeof STATES]

/**
 * Event types for connection events
 */
export type ConnectionEventType =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'connecting'
  | 'disconnecting'
  | 'open'
  | 'close'
  | 'reconnected'

/**
 * Connection options
 */
export interface ConnectionOptions {
  /** Database name */
  dbName?: string
  /** Auto create indexes on model creation */
  autoIndex?: boolean
  /** Auto create collections */
  autoCreate?: boolean
  /** Maximum pool size (not applicable for DO but kept for compatibility) */
  maxPoolSize?: number
  /** Minimum pool size */
  minPoolSize?: number
  /** Buffer commands when disconnected */
  bufferCommands?: boolean
}

/**
 * Cloudflare Worker environment interface
 * This defines the expected shape of the Worker env object
 */
export interface WorkerEnv {
  /** The Durable Object binding for mongo.do */
  MONGODB?: DurableObjectNamespace
  /** Alternative binding names */
  DB?: DurableObjectNamespace
  DATABASE?: DurableObjectNamespace
  /** Any other DO bindings */
  [key: string]: unknown
}

/**
 * Session options for transactions
 */
export interface SessionOptions {
  /** Default transaction options */
  defaultTransactionOptions?: {
    readConcern?: { level: string }
    writeConcern?: { w: number | string }
  }
}

/**
 * Client session for transactions (placeholder)
 */
export interface ClientSession {
  /** Session ID */
  id: string
  /** Whether the session is in a transaction */
  inTransaction(): boolean
  /** Start a transaction */
  startTransaction(options?: Record<string, unknown>): void
  /** Commit the transaction */
  commitTransaction(): Promise<void>
  /** Abort the transaction */
  abortTransaction(): Promise<void>
  /** End the session */
  endSession(): Promise<void>
  /** Run a callback in a transaction */
  withTransaction<T>(fn: () => Promise<T>, options?: Record<string, unknown>): Promise<T>
}

// ============ Simple EventEmitter ============

type EventListener = (...args: unknown[]) => void

/**
 * Simple EventEmitter implementation for connection events
 * Uses native EventTarget internally but provides Node.js-style API
 */
class SimpleEventEmitter {
  private _listeners: Map<string, Set<EventListener>> = new Map()

  /**
   * Add an event listener
   */
  on(event: string, listener: EventListener): this {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event)!.add(listener)
    return this
  }

  /**
   * Add a one-time event listener
   */
  once(event: string, listener: EventListener): this {
    const onceWrapper: EventListener = (...args) => {
      this.off(event, onceWrapper)
      listener(...args)
    }
    return this.on(event, onceWrapper)
  }

  /**
   * Remove an event listener
   */
  off(event: string, listener: EventListener): this {
    const listeners = this._listeners.get(event)
    if (listeners) {
      listeners.delete(listener)
    }
    return this
  }

  /**
   * Remove all listeners for an event (or all events if no event specified)
   */
  removeAllListeners(event?: string): this {
    if (event) {
      this._listeners.delete(event)
    } else {
      this._listeners.clear()
    }
    return this
  }

  /**
   * Emit an event
   */
  emit(event: string, ...args: unknown[]): boolean {
    const listeners = this._listeners.get(event)
    if (!listeners || listeners.size === 0) {
      return false
    }
    const listenerArray = Array.from(listeners)
    for (const listener of listenerArray) {
      try {
        listener(...args)
      } catch (err) {
        console.error(`Error in event listener for "${event}":`, err)
      }
    }
    return true
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount(event: string): number {
    return this._listeners.get(event)?.size ?? 0
  }

  /**
   * Get all listeners for an event
   */
  listeners(event: string): EventListener[] {
    return Array.from(this._listeners.get(event) ?? [])
  }

  /**
   * Alias for on()
   */
  addListener(event: string, listener: EventListener): this {
    return this.on(event, listener)
  }

  /**
   * Alias for off()
   */
  removeListener(event: string, listener: EventListener): this {
    return this.off(event, listener)
  }
}

// ============ Connection Class ============

/**
 * Connection class for managing database connections
 * Adapts mongoose.do for Cloudflare Workers with Durable Objects
 */
export class Connection extends SimpleEventEmitter {
  /** Current ready state */
  private _readyState: ConnectionState = STATES.disconnected

  /** Registered models for this connection */
  private _models: Map<string, ModelConstructor<any>> = new Map()

  /** Database reference (placeholder for mongo.do DO) */
  private _db: unknown = null

  /** Database name */
  private _name: string = ''

  /** Connection options */
  private _options: ConnectionOptions = {}

  /** Worker environment reference */
  private _env: WorkerEnv | null = null

  /** The host (for Mongoose compatibility) */
  private _host: string = 'durable-object'

  /** The port (for Mongoose compatibility) */
  private _port: number = 0

  /** Connection URI (for Mongoose compatibility) */
  private _uri: string = ''

  /** Buffer for commands issued before connection is ready */
  private _commandBuffer: Array<() => Promise<void>> = []

  // ============ Getters ============

  /**
   * Get the current ready state
   */
  get readyState(): ConnectionState {
    return this._readyState
  }

  /**
   * Get registered models
   */
  get models(): Map<string, ModelConstructor<any>> {
    return this._models
  }

  /**
   * Get database reference
   */
  get db(): unknown {
    return this._db
  }

  /**
   * Get database name
   */
  get name(): string {
    return this._name
  }

  /**
   * Get the host
   */
  get host(): string {
    return this._host
  }

  /**
   * Get the port
   */
  get port(): number {
    return this._port
  }

  /**
   * Get connection options
   */
  get options(): ConnectionOptions {
    return this._options
  }

  /**
   * Alias for models property (Mongoose compatibility)
   */
  get collections(): Map<string, ModelConstructor<any>> {
    return this._models
  }

  // ============ Connection Methods ============

  /**
   * Open a connection
   * In Workers context, this validates the environment is set up
   */
  async openUri(uri?: string, options?: ConnectionOptions): Promise<this> {
    if (this._readyState === STATES.connected) {
      return this
    }

    this._readyState = STATES.connecting
    this.emit('connecting')

    try {
      // Store URI and options
      this._uri = uri || ''
      this._options = { ...this._options, ...options }
      this._name = options?.dbName || this._extractDbName(uri) || 'default'

      // In Workers context, we connect when env is provided via useEnv()
      // For now, if env is already set, mark as connected
      if (this._env) {
        this._readyState = STATES.connected
        this.emit('connected')
        this.emit('open')

        // Process buffered commands
        await this._flushCommandBuffer()
      }

      return this
    } catch (err) {
      this._readyState = STATES.disconnected
      this.emit('error', err)
      throw err
    }
  }

  /**
   * Set the Worker environment - this is the primary way to connect in Workers
   */
  useEnv(env: WorkerEnv): this {
    this._env = env

    // Find the DO binding
    const binding = env.MONGODB || env.DB || env.DATABASE
    if (binding) {
      this._db = binding
    }

    // If we were waiting to connect, complete the connection
    if (this._readyState === STATES.connecting || this._readyState === STATES.disconnected) {
      this._readyState = STATES.connected
      this.emit('connected')
      this.emit('open')

      // Process buffered commands
      this._flushCommandBuffer().catch((err) => {
        console.error('Error flushing command buffer:', err)
      })
    }

    return this
  }

  /**
   * Get the Worker environment
   */
  getEnv(): WorkerEnv | null {
    return this._env
  }

  /**
   * Close the connection
   */
  async close(force?: boolean): Promise<void> {
    if (this._readyState === STATES.disconnected) {
      return
    }

    this._readyState = STATES.disconnecting
    this.emit('disconnecting')

    try {
      // Clean up
      this._db = null
      this._env = null
      this._commandBuffer = []

      this._readyState = STATES.disconnected
      this.emit('disconnected')
      this.emit('close')
    } catch (err) {
      this.emit('error', err)
      throw err
    }
  }

  /**
   * Alias for close
   */
  async disconnect(): Promise<void> {
    return this.close()
  }

  /**
   * Extract database name from URI
   */
  private _extractDbName(uri?: string): string {
    if (!uri) return ''
    try {
      const url = new URL(uri)
      return url.pathname.slice(1) || ''
    } catch {
      return ''
    }
  }

  /**
   * Buffer a command if not connected
   */
  private _bufferCommand(fn: () => Promise<void>): void {
    if (this._options.bufferCommands !== false) {
      this._commandBuffer.push(fn)
    }
  }

  /**
   * Flush buffered commands
   */
  private async _flushCommandBuffer(): Promise<void> {
    const commands = [...this._commandBuffer]
    this._commandBuffer = []

    for (const cmd of commands) {
      await cmd()
    }
  }

  // ============ Model Methods ============

  /**
   * Register or retrieve a model
   */
  model<T extends Record<string, unknown> = Record<string, unknown>>(
    name: string,
    schema?: Schema<T>,
    collection?: string
  ): ModelConstructor<T> {
    // If only name provided, try to get existing model
    if (!schema) {
      const existingModel = this._models.get(name) || getModel<T>(name)
      if (!existingModel) {
        throw new Error(`Model "${name}" not found. Did you register it with a schema?`)
      }
      return existingModel
    }

    // Check if model already exists
    if (this._models.has(name)) {
      return this._models.get(name)! as ModelConstructor<T>
    }

    // Create the model
    const ModelClass = createModel<T>(name, schema, {
      collection,
      connection: this,
    })

    // Store in connection's model registry
    this._models.set(name, ModelClass)

    return ModelClass
  }

  /**
   * Get all registered model names
   */
  modelNames(): string[] {
    return Array.from(this._models.keys())
  }

  /**
   * Delete a model from the connection
   */
  deleteModel(name: string): this {
    this._models.delete(name)
    deleteModel(name)
    return this
  }

  /**
   * Check if a model exists
   */
  hasModel(name: string): boolean {
    return this._models.has(name)
  }

  // ============ Transaction Methods ============

  /**
   * Start a session for transactions
   * Note: This is a placeholder - actual implementation depends on mongo.do
   */
  async startSession(options?: SessionOptions): Promise<ClientSession> {
    const sessionId = crypto.randomUUID()
    let inTransaction = false
    let transactionOptions: Record<string, unknown> = {}

    const session: ClientSession = {
      id: sessionId,

      inTransaction(): boolean {
        return inTransaction
      },

      startTransaction(opts?: Record<string, unknown>): void {
        if (inTransaction) {
          throw new Error('Transaction already in progress')
        }
        inTransaction = true
        transactionOptions = opts || options?.defaultTransactionOptions || {}
      },

      async commitTransaction(): Promise<void> {
        if (!inTransaction) {
          throw new Error('No transaction in progress')
        }
        // TODO: Actual commit via mongo.do
        inTransaction = false
        transactionOptions = {}
      },

      async abortTransaction(): Promise<void> {
        if (!inTransaction) {
          throw new Error('No transaction in progress')
        }
        // TODO: Actual abort via mongo.do
        inTransaction = false
        transactionOptions = {}
      },

      async endSession(): Promise<void> {
        if (inTransaction) {
          await session.abortTransaction()
        }
        // TODO: Clean up session in mongo.do
      },

      async withTransaction<T>(
        fn: () => Promise<T>,
        opts?: Record<string, unknown>
      ): Promise<T> {
        session.startTransaction(opts)
        try {
          const result = await fn()
          await session.commitTransaction()
          return result
        } catch (err) {
          await session.abortTransaction()
          throw err
        }
      },
    }

    return session
  }

  /**
   * Run a function within a transaction
   */
  async transaction<T>(
    fn: (session: ClientSession) => Promise<T>,
    options?: SessionOptions
  ): Promise<T> {
    const session = await this.startSession(options)
    try {
      return await session.withTransaction(() => fn(session))
    } finally {
      await session.endSession()
    }
  }

  // ============ Utility Methods ============

  /**
   * Set a connection option
   */
  set(key: keyof ConnectionOptions, value: unknown): this {
    (this._options as Record<string, unknown>)[key] = value
    return this
  }

  /**
   * Get a connection option
   */
  get(key: keyof ConnectionOptions): unknown {
    return (this._options as Record<string, unknown>)[key]
  }

  /**
   * Create a new connection (for multiple database support)
   */
  createConnection(): Connection {
    return new Connection()
  }

  /**
   * Get the client (Mongoose compatibility)
   */
  getClient(): unknown {
    return this._db
  }

  /**
   * Set the client
   */
  setClient(client: unknown): this {
    this._db = client
    return this
  }

  /**
   * Sync all indexes for registered models
   */
  async syncIndexes(options?: { background?: boolean }): Promise<Record<string, string[]>> {
    const results: Record<string, string[]> = {}
    const entries = Array.from(this._models.entries())

    for (const [name, ModelClass] of entries) {
      results[name] = await ModelClass.syncIndexes()
    }

    return results
  }

  /**
   * Drop the database
   * Note: Placeholder - actual implementation depends on mongo.do
   */
  async dropDatabase(): Promise<void> {
    // TODO: Implement via mongo.do
    console.warn('dropDatabase() is not yet implemented')
  }

  /**
   * List all collections
   */
  async listCollections(): Promise<string[]> {
    // TODO: Implement via mongo.do
    return this.modelNames()
  }

  /**
   * Get a collection by name (Mongoose compatibility)
   */
  collection(name: string): unknown {
    // TODO: Return actual collection from mongo.do
    return null
  }

  /**
   * Watch for changes (Mongoose compatibility)
   */
  watch(pipeline?: Record<string, unknown>[], options?: Record<string, unknown>): unknown {
    // TODO: Implement change streams via mongo.do
    console.warn('watch() is not yet implemented')
    return null
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this._readyState === STATES.connected
  }

  /**
   * Asynchronously iterate over models
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<[string, ModelConstructor<any>]> {
    const entries = Array.from(this._models.entries())
    for (const entry of entries) {
      yield entry
    }
  }
}

// ============ Factory Function for Workers ============

/**
 * Create a mongoose.do instance configured for a Cloudflare Worker
 * This is the recommended way to use mongoose.do in Workers
 *
 * @example
 * ```typescript
 * // In your Worker
 * export default {
 *   async fetch(request: Request, env: Env) {
 *     const mongoose = createMongoose(env)
 *
 *     const User = mongoose.model('User', userSchema)
 *     const users = await User.find()
 *
 *     return Response.json(users)
 *   }
 * }
 * ```
 */
export function createMongoose(env: WorkerEnv, options?: ConnectionOptions): Connection {
  const connection = new Connection()

  if (options) {
    connection.openUri('', options)
  }

  connection.useEnv(env)

  return connection
}

// ============ Connect Function ============

/**
 * Connect to database (Mongoose-compatible API)
 * In Workers, this is mainly for API compatibility - use createMongoose() instead
 */
export async function connect(
  uri?: string,
  options?: ConnectionOptions
): Promise<Connection> {
  return defaultConnection.openUri(uri, options)
}

/**
 * Disconnect from database
 */
export async function disconnect(): Promise<void> {
  return defaultConnection.close()
}

// ============ Default Connection ============

/**
 * The default connection instance
 * This mimics mongoose.connection
 */
export const defaultConnection = new Connection()

/**
 * Alias for defaultConnection (mongoose.connection pattern)
 */
export const connection = defaultConnection

// ============ Exports ============

export default Connection
