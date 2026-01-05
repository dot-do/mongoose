/**
 * Middleware/Hooks System for Mongoose.do
 *
 * Implements Mongoose-compatible pre/post hooks for documents, queries, models, and aggregations.
 */

import type { Schema, HookType, PreHookFn, PostHookFn } from '../schema/index.js'

// ============ Hook Category Types ============

/**
 * Document middleware hooks - operate on document instances
 */
export type DocumentHookType =
  | 'validate'
  | 'save'
  | 'remove'
  | 'updateOne'
  | 'deleteOne'
  | 'init'

/**
 * Query middleware hooks - operate on Query objects
 */
export type QueryHookType =
  | 'find'
  | 'findOne'
  | 'findOneAndUpdate'
  | 'findOneAndDelete'
  | 'findOneAndReplace'
  | 'updateOne'
  | 'updateMany'
  | 'deleteOne'
  | 'deleteMany'

/**
 * Model middleware hooks - operate on Model class methods
 */
export type ModelHookType = 'insertMany'

/**
 * Aggregate middleware hooks - operate on Aggregation pipeline
 */
export type AggregateHookType = 'aggregate'

// ============ Middleware Entry Types ============

export interface MiddlewareOptions {
  /** Run this hook on document operations (default: true for document hooks) */
  document?: boolean
  /** Run this hook on query operations (default: true for query hooks) */
  query?: boolean
}

export interface MiddlewareEntry {
  fn: Function
  options?: MiddlewareOptions
}

// ============ Hook Context Types ============

/**
 * Context passed to hooks during execution
 */
export interface HookContext {
  /** The document being operated on (for document hooks) */
  document?: any
  /** The query being executed (for query hooks) */
  query?: any
  /** The model class */
  model?: any
  /** The aggregation pipeline (for aggregate hooks) */
  pipeline?: any[]
  /** Operation-specific options */
  options?: Record<string, any>
  /** Whether this is a new document (for save hooks) */
  isNew?: boolean
  /** Modified paths (for save/update hooks) */
  modifiedPaths?: string[]
}

// ============ Error Types ============

export class MiddlewareError extends Error {
  constructor(
    message: string,
    public readonly hookType: HookType,
    public readonly phase: 'pre' | 'post',
    public readonly originalError?: Error
  ) {
    super(message)
    this.name = 'MiddlewareError'

    // Capture original stack trace if available
    if (originalError?.stack) {
      this.stack = `${this.stack}\nCaused by: ${originalError.stack}`
    }
  }
}

// ============ MiddlewareChain Class ============

/**
 * Manages and executes pre and post hooks for a specific hook type
 */
export class MiddlewareChain {
  private _preHooks: MiddlewareEntry[] = []
  private _postHooks: MiddlewareEntry[] = []
  private _errorPostHooks: MiddlewareEntry[] = []

  constructor(
    public readonly hookType: HookType
  ) {}

  /**
   * Add a pre hook to the chain
   */
  addPre(fn: Function, options?: MiddlewareOptions): this {
    this._preHooks.push({ fn, options })
    return this
  }

  /**
   * Add a post hook to the chain
   */
  addPost(fn: Function, options?: MiddlewareOptions): this {
    this._postHooks.push({ fn, options })
    return this
  }

  /**
   * Add an error-handling post hook
   * Error post hooks receive (error, doc, next) and can handle or re-throw errors
   */
  addPostError(fn: Function, options?: MiddlewareOptions): this {
    this._errorPostHooks.push({ fn, options })
    return this
  }

  /**
   * Get all pre hooks
   */
  getPreHooks(): MiddlewareEntry[] {
    return [...this._preHooks]
  }

  /**
   * Get all post hooks
   */
  getPostHooks(): MiddlewareEntry[] {
    return [...this._postHooks]
  }

  /**
   * Run all pre hooks in sequence
   *
   * Hooks are executed in order. Each hook receives a next() callback.
   * Execution stops if:
   * - An error is thrown
   * - An error is passed to next(err)
   * - A hook returns a rejected Promise
   */
  async runPre(context: HookContext): Promise<void> {
    for (const entry of this._preHooks) {
      // Check if hook should run based on context type
      if (!this._shouldRunHook(entry, context)) {
        continue
      }

      await this._executeHook(entry.fn, context, 'pre')
    }
  }

  /**
   * Run all post hooks in sequence
   *
   * Post hooks receive the result of the operation.
   * Errors in post hooks are passed to error post hooks if available.
   */
  async runPost(context: HookContext, result: any): Promise<any> {
    let currentResult = result
    let caughtError: Error | null = null

    for (const entry of this._postHooks) {
      if (!this._shouldRunHook(entry, context)) {
        continue
      }

      try {
        const hookResult = await this._executePostHook(entry.fn, context, currentResult)
        // Allow hooks to transform the result
        if (hookResult !== undefined) {
          currentResult = hookResult
        }
      } catch (error) {
        caughtError = error instanceof Error ? error : new Error(String(error))
        break
      }
    }

    // If there was an error, try error post hooks
    if (caughtError && this._errorPostHooks.length > 0) {
      await this._runErrorPostHooks(context, caughtError, currentResult)
    } else if (caughtError) {
      throw new MiddlewareError(
        caughtError.message,
        this.hookType,
        'post',
        caughtError
      )
    }

    return currentResult
  }

  /**
   * Check if a hook should run based on its options and context
   */
  private _shouldRunHook(entry: MiddlewareEntry, context: HookContext): boolean {
    const options = entry.options

    // If no options specified, run by default
    if (!options) return true

    // Document hooks
    if (context.document !== undefined) {
      // If document option is explicitly false, skip
      if (options.document === false) return false
      // If query is true but document is not, might be query context
      if (options.query === true && options.document !== true) {
        return context.query !== undefined
      }
      return true
    }

    // Query hooks
    if (context.query !== undefined) {
      // If query option is explicitly false, skip
      if (options.query === false) return false
      return true
    }

    return true
  }

  /**
   * Execute a single pre hook
   */
  private async _executeHook(fn: Function, context: HookContext, phase: 'pre' | 'post'): Promise<void> {
    return new Promise((resolve, reject) => {
      // Determine the 'this' context for the hook
      const thisArg = context.document || context.query || context.model || {}

      // Check if the hook is async (returns Promise) or uses callback
      const hookArity = fn.length

      // Create the next() callback
      const next = (err?: Error) => {
        if (err) {
          reject(new MiddlewareError(err.message, this.hookType, phase, err))
        } else {
          resolve()
        }
      }

      try {
        // If hook expects next() callback (arity >= 1 for pre hooks)
        if (hookArity >= 1) {
          const result = fn.call(thisArg, next)

          // If it also returns a Promise, handle both patterns
          if (result && typeof result.then === 'function') {
            result.then(() => {
              // Don't resolve again if next() was already called
            }).catch((err: Error) => {
              reject(new MiddlewareError(err.message, this.hookType, phase, err))
            })
          }
        } else {
          // No next() callback expected - must be Promise-based
          const result = fn.call(thisArg)

          if (result && typeof result.then === 'function') {
            result.then(() => resolve()).catch((err: Error) => {
              reject(new MiddlewareError(err.message, this.hookType, phase, err))
            })
          } else {
            // Synchronous hook with no return
            resolve()
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        reject(new MiddlewareError(error.message, this.hookType, phase, error))
      }
    })
  }

  /**
   * Execute a single post hook
   */
  private async _executePostHook(fn: Function, context: HookContext, result: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const thisArg = context.document || context.query || context.model || {}
      const hookArity = fn.length

      const next = (err?: Error) => {
        if (err) {
          reject(err)
        } else {
          resolve(undefined)
        }
      }

      try {
        // Post hooks receive (doc/result, next) or just (doc/result)
        if (hookArity >= 2) {
          // Callback style: fn(doc, next)
          const hookResult = fn.call(thisArg, result, next)

          if (hookResult && typeof hookResult.then === 'function') {
            hookResult.then((res: any) => resolve(res)).catch(reject)
          }
        } else if (hookArity === 1) {
          // Promise style: fn(doc)
          const hookResult = fn.call(thisArg, result)

          if (hookResult && typeof hookResult.then === 'function') {
            hookResult.then((res: any) => resolve(res)).catch(reject)
          } else {
            resolve(hookResult)
          }
        } else {
          // No arguments
          const hookResult = fn.call(thisArg)

          if (hookResult && typeof hookResult.then === 'function') {
            hookResult.then((res: any) => resolve(res)).catch(reject)
          } else {
            resolve(hookResult)
          }
        }
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Run error post hooks to handle errors from post hooks
   */
  private async _runErrorPostHooks(context: HookContext, error: Error, result: any): Promise<void> {
    for (const entry of this._errorPostHooks) {
      if (!this._shouldRunHook(entry, context)) {
        continue
      }

      const thisArg = context.document || context.query || context.model || {}

      await new Promise<void>((resolve, reject) => {
        const next = (err?: Error) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        }

        try {
          const hookResult = entry.fn.call(thisArg, error, result, next)

          if (hookResult && typeof hookResult.then === 'function') {
            hookResult.then(() => resolve()).catch(reject)
          }
        } catch (err) {
          reject(err)
        }
      })
    }
  }

  /**
   * Clear all hooks
   */
  clear(): void {
    this._preHooks = []
    this._postHooks = []
    this._errorPostHooks = []
  }
}

// ============ MiddlewareManager Class ============

/**
 * Manages all middleware chains for a schema
 */
export class MiddlewareManager {
  private _chains: Map<HookType, MiddlewareChain> = new Map()

  /**
   * Get or create a middleware chain for a hook type
   */
  getChain(hookType: HookType): MiddlewareChain {
    let chain = this._chains.get(hookType)
    if (!chain) {
      chain = new MiddlewareChain(hookType)
      this._chains.set(hookType, chain)
    }
    return chain
  }

  /**
   * Check if there are any hooks for a given type
   */
  hasHooks(hookType: HookType): boolean {
    const chain = this._chains.get(hookType)
    if (!chain) return false
    return chain.getPreHooks().length > 0 || chain.getPostHooks().length > 0
  }

  /**
   * Create from a Schema's hook storage
   */
  static fromSchema(schema: Schema<any>): MiddlewareManager {
    const manager = new MiddlewareManager()

    // All possible hook types
    const hookTypes: HookType[] = [
      'validate', 'save', 'remove', 'updateOne', 'deleteOne', 'init',
      'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
      'updateMany', 'deleteMany', 'aggregate', 'insertMany'
    ]

    for (const hookType of hookTypes) {
      const preHooks = schema.getPreHooks(hookType)
      const postHooks = schema.getPostHooks(hookType)

      if (preHooks.length > 0 || postHooks.length > 0) {
        const chain = manager.getChain(hookType)

        for (const entry of preHooks) {
          chain.addPre(entry.fn, entry.options)
        }

        for (const entry of postHooks) {
          chain.addPost(entry.fn, entry.options)
        }
      }
    }

    return manager
  }
}

// ============ Helper Functions ============

/**
 * Execute pre hooks from a schema for a given hook type
 *
 * @param schema - The schema containing the hooks
 * @param hookType - The type of hook to execute
 * @param context - The execution context
 */
export async function executePreHooks(
  schema: Schema<any>,
  hookType: HookType,
  context: HookContext
): Promise<void> {
  const entries = schema.getPreHooks(hookType)

  if (entries.length === 0) return

  const chain = new MiddlewareChain(hookType)
  for (const entry of entries) {
    chain.addPre(entry.fn, entry.options)
  }

  await chain.runPre(context)
}

/**
 * Execute post hooks from a schema for a given hook type
 *
 * @param schema - The schema containing the hooks
 * @param hookType - The type of hook to execute
 * @param context - The execution context
 * @param result - The result of the operation
 * @returns The potentially modified result
 */
export async function executePostHooks<R>(
  schema: Schema<any>,
  hookType: HookType,
  context: HookContext,
  result: R
): Promise<R> {
  const entries = schema.getPostHooks(hookType)

  if (entries.length === 0) return result

  const chain = new MiddlewareChain(hookType)
  for (const entry of entries) {
    chain.addPost(entry.fn, entry.options)
  }

  return await chain.runPost(context, result) as R
}

/**
 * Execute both pre and post hooks around an operation
 *
 * @param schema - The schema containing the hooks
 * @param hookType - The type of hook to execute
 * @param context - The execution context
 * @param operation - The operation to execute between pre and post hooks
 * @returns The result of the operation
 */
export async function executeWithHooks<R>(
  schema: Schema<any>,
  hookType: HookType,
  context: HookContext,
  operation: () => R | Promise<R>
): Promise<R> {
  // Run pre hooks
  await executePreHooks(schema, hookType, context)

  // Execute the operation
  let result: R
  try {
    result = await operation()
  } catch (error) {
    throw error
  }

  // Run post hooks
  return await executePostHooks(schema, hookType, context, result)
}

/**
 * Create a hook context for document operations
 */
export function createDocumentContext(
  document: any,
  options?: {
    isNew?: boolean
    modifiedPaths?: string[]
    model?: any
  }
): HookContext {
  return {
    document,
    isNew: options?.isNew,
    modifiedPaths: options?.modifiedPaths,
    model: options?.model,
  }
}

/**
 * Create a hook context for query operations
 */
export function createQueryContext(
  query: any,
  options?: {
    model?: any
    options?: Record<string, any>
  }
): HookContext {
  return {
    query,
    model: options?.model,
    options: options?.options,
  }
}

/**
 * Create a hook context for aggregate operations
 */
export function createAggregateContext(
  pipeline: any[],
  options?: {
    model?: any
    options?: Record<string, any>
  }
): HookContext {
  return {
    pipeline,
    model: options?.model,
    options: options?.options,
  }
}

/**
 * Create a hook context for model operations (like insertMany)
 */
export function createModelContext(
  model: any,
  options?: {
    documents?: any[]
    options?: Record<string, any>
  }
): HookContext {
  return {
    model,
    document: options?.documents,
    options: options?.options,
  }
}

// ============ Utility Types ============

/**
 * Type guard to check if a hook type is a document hook
 */
export function isDocumentHook(hookType: HookType): hookType is DocumentHookType {
  const documentHooks: DocumentHookType[] = ['validate', 'save', 'remove', 'updateOne', 'deleteOne', 'init']
  return documentHooks.includes(hookType as DocumentHookType)
}

/**
 * Type guard to check if a hook type is a query hook
 */
export function isQueryHook(hookType: HookType): hookType is QueryHookType {
  const queryHooks: QueryHookType[] = [
    'find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace',
    'updateOne', 'updateMany', 'deleteOne', 'deleteMany'
  ]
  return queryHooks.includes(hookType as QueryHookType)
}

/**
 * Type guard to check if a hook type is a model hook
 */
export function isModelHook(hookType: HookType): hookType is ModelHookType {
  return hookType === 'insertMany'
}

/**
 * Type guard to check if a hook type is an aggregate hook
 */
export function isAggregateHook(hookType: HookType): hookType is AggregateHookType {
  return hookType === 'aggregate'
}

// ============ Exports ============

export type {
  HookType,
  PreHookFn,
  PostHookFn,
}
