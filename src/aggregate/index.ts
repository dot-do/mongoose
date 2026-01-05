/**
 * Aggregate Builder - MongoDB Aggregation Pipeline for Mondoo
 *
 * @example
 * ```typescript
 * // Basic aggregation
 * const results = await User.aggregate()
 *   .match({ active: true })
 *   .group({ _id: '$department', count: { $sum: 1 } })
 *   .sort({ count: -1 })
 *   .limit(10)
 *   .exec()
 *
 * // With initial pipeline
 * const stats = await Order.aggregate([
 *   { $match: { status: 'completed' } }
 * ])
 *   .group({ _id: '$customerId', total: { $sum: '$amount' } })
 *   .sort({ total: -1 })
 *
 * // Faceted search
 * const results = await Product.aggregate()
 *   .facet({
 *     categories: [{ $group: { _id: '$category', count: { $sum: 1 } } }],
 *     priceRanges: [{ $bucket: { groupBy: '$price', boundaries: [0, 100, 500, 1000] } }]
 *   })
 * ```
 */

import type { Schema } from '../schema/index.js'

// ============ Types ============

/**
 * Options for aggregate execution
 */
export interface AggregateOptions {
  /** Allow disk use for large result sets */
  allowDiskUse?: boolean
  /** Set batch size for cursor */
  batchSize?: number
  /** Maximum time for operation (ms) */
  maxTimeMS?: number
  /** Read preference */
  readPreference?: string
  /** Read concern level */
  readConcern?: { level: string }
  /** Collation options */
  collation?: {
    locale: string
    caseLevel?: boolean
    caseFirst?: 'upper' | 'lower' | 'off'
    strength?: 1 | 2 | 3 | 4 | 5
    numericOrdering?: boolean
    alternate?: 'non-ignorable' | 'shifted'
    maxVariable?: 'punct' | 'space'
    backwards?: boolean
  }
  /** Comment for logging */
  comment?: string
  /** Hint for index usage */
  hint?: Record<string, 1 | -1> | string
  /** Let variables for the pipeline */
  let?: Record<string, unknown>
  /** Client session for transactions */
  session?: unknown
  /** Write concern (for $out and $merge stages) */
  writeConcern?: {
    w?: number | 'majority'
    j?: boolean
    wtimeout?: number
  }
  /** Bypass document validation (for $out and $merge) */
  bypassDocumentValidation?: boolean
}

/**
 * $lookup stage options
 */
export interface LookupOptions {
  from: string
  localField?: string
  foreignField?: string
  as: string
  let?: Record<string, unknown>
  pipeline?: Record<string, unknown>[]
}

/**
 * $unwind stage options
 */
export interface UnwindOptions {
  path: string
  includeArrayIndex?: string
  preserveNullAndEmptyArrays?: boolean
}

/**
 * $bucket stage options
 */
export interface BucketOptions {
  groupBy: string | Record<string, unknown>
  boundaries: (number | Date)[]
  default?: unknown
  output?: Record<string, unknown>
}

/**
 * $bucketAuto stage options
 */
export interface BucketAutoOptions {
  groupBy: string | Record<string, unknown>
  buckets: number
  output?: Record<string, unknown>
  granularity?: 'R5' | 'R10' | 'R20' | 'R40' | 'R80' | '1-2-5' | 'E6' | 'E12' | 'E24' | 'E48' | 'E96' | 'E192' | 'POWERSOF2'
}

/**
 * $merge stage options
 */
export interface MergeOptions {
  into: string | { db: string; coll: string }
  on?: string | string[]
  whenMatched?: 'replace' | 'keepExisting' | 'merge' | 'fail' | Record<string, unknown>[]
  whenNotMatched?: 'insert' | 'discard' | 'fail'
  let?: Record<string, unknown>
}

/**
 * $graphLookup stage options
 */
export interface GraphLookupOptions {
  from: string
  startWith: string | Record<string, unknown>
  connectFromField: string
  connectToField: string
  as: string
  maxDepth?: number
  depthField?: string
  restrictSearchWithMatch?: Record<string, unknown>
}

/**
 * $geoNear stage options
 */
export interface GeoNearOptions {
  near: { type: 'Point'; coordinates: [number, number] } | [number, number]
  distanceField: string
  spherical?: boolean
  maxDistance?: number
  minDistance?: number
  query?: Record<string, unknown>
  distanceMultiplier?: number
  includeLocs?: string
  key?: string
}

/**
 * $sample stage options
 */
export interface SampleOptions {
  size: number
}

/**
 * $unionWith stage options
 */
export interface UnionWithOptions {
  coll: string
  pipeline?: Record<string, unknown>[]
}

/**
 * Model interface for aggregate operations
 */
export interface AggregateModelLike<T = unknown> {
  collection?: {
    aggregate(pipeline: Record<string, unknown>[], options?: AggregateOptions): Promise<T[]>
  }
  modelName?: string
  schema?: Schema<any>
}

// ============ Aggregate Class ============

/**
 * Chainable aggregation pipeline builder for Mondoo
 *
 * The Aggregate class is LAZY - it doesn't execute until:
 * - exec() is called
 * - then() is called (await/Promise chain)
 *
 * @template TResult - The expected result type
 */
export class Aggregate<TResult = unknown> implements PromiseLike<TResult[]> {
  // ============ Aggregate State ============

  /** The aggregation pipeline stages */
  private _pipeline: Record<string, unknown>[] = []

  /** Aggregation options */
  private _options: AggregateOptions = {}

  /** Reference to the Model */
  private _model: AggregateModelLike

  // ============ Constructor ============

  /**
   * Create a new Aggregate instance
   * @param model - The model to aggregate against
   * @param pipeline - Initial pipeline stages
   */
  constructor(model: AggregateModelLike, pipeline: Record<string, unknown>[] = []) {
    this._model = model
    this._pipeline = [...pipeline]
  }

  // ============ Pipeline Stage Methods ============

  /**
   * Add a $match stage to filter documents
   * @param filter - The filter conditions
   * @example aggregate.match({ status: 'active', age: { $gte: 18 } })
   */
  match(filter: Record<string, unknown>): this {
    this._pipeline.push({ $match: filter })
    return this
  }

  /**
   * Add a $project stage to reshape documents
   * @param spec - The projection specification
   * @example aggregate.project({ name: 1, fullName: { $concat: ['$firstName', ' ', '$lastName'] } })
   */
  project(spec: Record<string, unknown>): this {
    this._pipeline.push({ $project: spec })
    return this
  }

  /**
   * Add a $group stage to group documents
   * @param spec - The grouping specification (must include _id)
   * @example aggregate.group({ _id: '$department', count: { $sum: 1 }, avgSalary: { $avg: '$salary' } })
   */
  group(spec: Record<string, unknown>): this {
    this._pipeline.push({ $group: spec })
    return this
  }

  /**
   * Add a $sort stage to order documents
   * @param spec - The sort specification
   * @example aggregate.sort({ count: -1, name: 1 })
   */
  sort(spec: Record<string, 1 | -1 | { $meta: string }>): this {
    this._pipeline.push({ $sort: spec })
    return this
  }

  /**
   * Add a $limit stage to limit number of documents
   * @param n - Maximum number of documents
   * @example aggregate.limit(10)
   */
  limit(n: number): this {
    this._pipeline.push({ $limit: n })
    return this
  }

  /**
   * Add a $skip stage to skip documents
   * @param n - Number of documents to skip
   * @example aggregate.skip(20)
   */
  skip(n: number): this {
    this._pipeline.push({ $skip: n })
    return this
  }

  /**
   * Add a $unwind stage to deconstruct arrays
   * @param path - The array field path or unwind options
   * @example aggregate.unwind('$tags')
   * @example aggregate.unwind({ path: '$tags', preserveNullAndEmptyArrays: true })
   */
  unwind(path: string | UnwindOptions): this {
    if (typeof path === 'string') {
      this._pipeline.push({ $unwind: path })
    } else {
      this._pipeline.push({ $unwind: path })
    }
    return this
  }

  /**
   * Add a $lookup stage to join with another collection
   * @param spec - The lookup specification
   * @example aggregate.lookup({ from: 'orders', localField: '_id', foreignField: 'customerId', as: 'orders' })
   */
  lookup(spec: LookupOptions): this {
    this._pipeline.push({ $lookup: spec })
    return this
  }

  /**
   * Add a $facet stage for multi-faceted aggregations
   * @param spec - The facet specifications
   * @example aggregate.facet({ byCategory: [{ $group: { _id: '$category' } }], byPrice: [{ $bucket: {...} }] })
   */
  facet(spec: Record<string, Record<string, unknown>[]>): this {
    this._pipeline.push({ $facet: spec })
    return this
  }

  /**
   * Add a $bucket stage to categorize documents into groups
   * @param spec - The bucket specification
   * @example aggregate.bucket({ groupBy: '$price', boundaries: [0, 100, 500, 1000], default: 'Other' })
   */
  bucket(spec: BucketOptions): this {
    this._pipeline.push({ $bucket: spec })
    return this
  }

  /**
   * Add a $bucketAuto stage for automatic bucket boundaries
   * @param spec - The bucket auto specification
   * @example aggregate.bucketAuto({ groupBy: '$price', buckets: 4 })
   */
  bucketAuto(spec: BucketAutoOptions): this {
    this._pipeline.push({ $bucketAuto: spec })
    return this
  }

  /**
   * Add a $addFields stage to add new fields
   * @param fields - The fields to add
   * @example aggregate.addFields({ fullName: { $concat: ['$firstName', ' ', '$lastName'] } })
   */
  addFields(fields: Record<string, unknown>): this {
    this._pipeline.push({ $addFields: fields })
    return this
  }

  /**
   * Add a $set stage (alias for $addFields)
   * @param fields - The fields to set
   */
  set(fields: Record<string, unknown>): this {
    this._pipeline.push({ $set: fields })
    return this
  }

  /**
   * Add a $replaceRoot stage to replace the document root
   * @param spec - The replacement specification
   * @example aggregate.replaceRoot({ newRoot: '$embeddedDoc' })
   */
  replaceRoot(spec: { newRoot: string | Record<string, unknown> }): this {
    this._pipeline.push({ $replaceRoot: spec })
    return this
  }

  /**
   * Add a $replaceWith stage (alias for $replaceRoot)
   * @param replacement - The replacement expression
   */
  replaceWith(replacement: string | Record<string, unknown>): this {
    this._pipeline.push({ $replaceWith: replacement })
    return this
  }

  /**
   * Add a $count stage to count documents
   * @param field - The name of the count field
   * @example aggregate.count('total')
   */
  count(field: string): this {
    this._pipeline.push({ $count: field })
    return this
  }

  /**
   * Add a $merge stage to write results to a collection
   * @param spec - The merge specification (string for collection name or options object)
   * @example aggregate.merge('output_collection')
   * @example aggregate.merge({ into: 'output', whenMatched: 'replace' })
   */
  merge(spec: string | MergeOptions): this {
    if (typeof spec === 'string') {
      this._pipeline.push({ $merge: { into: spec } })
    } else {
      this._pipeline.push({ $merge: spec })
    }
    return this
  }

  /**
   * Add a $out stage to write results to a collection
   * @param collection - The output collection name
   * @example aggregate.out('archived_orders')
   */
  out(collection: string): this {
    this._pipeline.push({ $out: collection })
    return this
  }

  /**
   * Add a $redact stage for field-level access control
   * @param expression - The redact expression
   * @example aggregate.redact({ $cond: { if: { $eq: ['$level', 'public'] }, then: '$$DESCEND', else: '$$PRUNE' } })
   */
  redact(expression: Record<string, unknown>): this {
    this._pipeline.push({ $redact: expression })
    return this
  }

  /**
   * Add a $sample stage to randomly select documents
   * @param spec - The sample specification or size number
   * @example aggregate.sample(100)
   * @example aggregate.sample({ size: 100 })
   */
  sample(spec: number | SampleOptions): this {
    if (typeof spec === 'number') {
      this._pipeline.push({ $sample: { size: spec } })
    } else {
      this._pipeline.push({ $sample: spec })
    }
    return this
  }

  /**
   * Add a $sortByCount stage (groups and counts, then sorts)
   * @param expression - The field or expression to sort by count
   * @example aggregate.sortByCount('$category')
   */
  sortByCount(expression: string | Record<string, unknown>): this {
    this._pipeline.push({ $sortByCount: expression })
    return this
  }

  /**
   * Add a $graphLookup stage for recursive lookups
   * @param spec - The graph lookup specification
   */
  graphLookup(spec: GraphLookupOptions): this {
    this._pipeline.push({ $graphLookup: spec })
    return this
  }

  /**
   * Add a $geoNear stage for geospatial queries (must be first stage)
   * @param spec - The geo near specification
   */
  near(spec: GeoNearOptions): this {
    // $geoNear must be the first stage in the pipeline
    this._pipeline.unshift({ $geoNear: spec })
    return this
  }

  /**
   * Add a $unset stage to remove fields
   * @param fields - Field(s) to remove
   * @example aggregate.unset('password')
   * @example aggregate.unset(['password', 'internalNotes'])
   */
  unset(fields: string | string[]): this {
    this._pipeline.push({ $unset: fields })
    return this
  }

  /**
   * Add a $densify stage to fill in gaps
   * @param spec - The densify specification
   */
  densify(spec: { field: string; partitionByFields?: string[]; range: { step: number; unit?: string; bounds: [unknown, unknown] | 'full' | 'partition' } }): this {
    this._pipeline.push({ $densify: spec })
    return this
  }

  /**
   * Add a $fill stage to fill null/missing values
   * @param spec - The fill specification
   */
  fill(spec: { partitionBy?: Record<string, unknown>; partitionByFields?: string[]; sortBy?: Record<string, 1 | -1>; output: Record<string, { value: unknown } | { method: 'linear' | 'locf' }> }): this {
    this._pipeline.push({ $fill: spec })
    return this
  }

  /**
   * Add a $unionWith stage to combine pipelines
   * @param spec - The union specification
   * @example aggregate.unionWith({ coll: 'archive', pipeline: [{ $match: { archived: true } }] })
   */
  unionWith(spec: string | UnionWithOptions): this {
    if (typeof spec === 'string') {
      this._pipeline.push({ $unionWith: { coll: spec } })
    } else {
      this._pipeline.push({ $unionWith: spec })
    }
    return this
  }

  /**
   * Add a $setWindowFields stage for window functions
   * @param spec - The window fields specification
   */
  setWindowFields(spec: { partitionBy?: string | Record<string, unknown>; sortBy?: Record<string, 1 | -1>; output: Record<string, unknown> }): this {
    this._pipeline.push({ $setWindowFields: spec })
    return this
  }

  /**
   * Add a $search stage (MongoDB Atlas Search)
   * @param spec - The search specification
   */
  search(spec: Record<string, unknown>): this {
    this._pipeline.push({ $search: spec })
    return this
  }

  /**
   * Add a $searchMeta stage (MongoDB Atlas Search metadata)
   * @param spec - The search meta specification
   */
  searchMeta(spec: Record<string, unknown>): this {
    this._pipeline.push({ $searchMeta: spec })
    return this
  }

  // ============ Generic Stage Methods ============

  /**
   * Append one or more stages to the pipeline
   * @param stages - The stages to append
   * @example aggregate.append({ $match: { active: true } }, { $sort: { name: 1 } })
   */
  append(...stages: Record<string, unknown>[]): this {
    this._pipeline.push(...stages)
    return this
  }

  /**
   * Add a raw stage to the pipeline
   * @param stage - The raw stage object
   */
  addStage(stage: Record<string, unknown>): this {
    this._pipeline.push(stage)
    return this
  }

  // ============ Options Methods ============

  /**
   * Set an option for the aggregation
   * @param key - The option name
   * @param value - The option value
   */
  option<K extends keyof AggregateOptions>(key: K, value: AggregateOptions[K]): this {
    this._options[key] = value
    return this
  }

  /**
   * Set multiple options at once
   * @param options - The options object
   */
  setOptions(options: AggregateOptions): this {
    Object.assign(this._options, options)
    return this
  }

  /**
   * Enable disk use for large result sets
   * @param val - Whether to allow disk use
   */
  allowDiskUse(val: boolean = true): this {
    this._options.allowDiskUse = val
    return this
  }

  /**
   * Set batch size for cursor
   * @param size - The batch size
   */
  batchSize(size: number): this {
    this._options.batchSize = size
    return this
  }

  /**
   * Set read preference
   * @param pref - The read preference
   */
  read(pref: string): this {
    this._options.readPreference = pref
    return this
  }

  /**
   * Set read concern
   * @param level - The read concern level
   */
  readConcern(level: string): this {
    this._options.readConcern = { level }
    return this
  }

  /**
   * Set maximum time for operation
   * @param ms - Maximum time in milliseconds
   */
  maxTimeMS(ms: number): this {
    this._options.maxTimeMS = ms
    return this
  }

  /**
   * Set collation options
   * @param collation - The collation options
   */
  collation(collation: AggregateOptions['collation']): this {
    this._options.collation = collation
    return this
  }

  /**
   * Add a comment to the aggregation
   * @param val - The comment string
   */
  comment(val: string): this {
    this._options.comment = val
    return this
  }

  /**
   * Set index hint
   * @param hint - The index hint
   */
  hint(hint: Record<string, 1 | -1> | string): this {
    this._options.hint = hint
    return this
  }

  /**
   * Set let variables for the pipeline
   * @param variables - The variable definitions
   */
  let(variables: Record<string, unknown>): this {
    this._options.let = variables
    return this
  }

  /**
   * Set session for transactions
   * @param clientSession - The client session
   */
  session(clientSession: unknown): this {
    this._options.session = clientSession
    return this
  }

  // ============ Pipeline Manipulation ============

  /**
   * Get the current pipeline
   */
  pipeline(): Record<string, unknown>[] {
    return [...this._pipeline]
  }

  /**
   * Get the current options
   */
  getOptions(): AggregateOptions {
    return { ...this._options }
  }

  /**
   * Get the model reference
   */
  model(): AggregateModelLike {
    return this._model
  }

  /**
   * Clone this aggregate
   */
  clone(): Aggregate<TResult> {
    const cloned = new Aggregate<TResult>(this._model, [...this._pipeline])
    cloned._options = { ...this._options }
    return cloned
  }

  // ============ Execution ============

  /**
   * Execute the aggregation and return a Promise
   */
  async exec(): Promise<TResult[]> {
    // Run pre-aggregate hooks if schema exists
    const schema = this._model.schema
    if (schema) {
      const preHooks = schema.getPreHooks('aggregate')
      for (const hook of preHooks) {
        await new Promise<void>((resolve, reject) => {
          hook.fn.call(this, (err?: Error) => {
            if (err) reject(err)
            else resolve()
          })
        })
      }
    }

    // Execute the actual aggregation
    let result: TResult[]

    const collection = this._model.collection
    if (collection) {
      result = await collection.aggregate(this._pipeline, this._options) as TResult[]
    } else {
      // Placeholder when no collection is available
      result = []
    }

    // Run post-aggregate hooks if schema exists
    if (schema) {
      const postHooks = schema.getPostHooks('aggregate')
      for (const hook of postHooks) {
        await new Promise<void>((resolve, reject) => {
          hook.fn.call(this, result, (err?: Error) => {
            if (err) reject(err)
            else resolve()
          })
        })
      }
    }

    return result
  }

  /**
   * Make the aggregate thenable (allows await/Promise chain)
   */
  then<TFulfilled = TResult[], TRejected = never>(
    onfulfilled?: ((value: TResult[]) => TFulfilled | PromiseLike<TFulfilled>) | null,
    onrejected?: ((reason: unknown) => TRejected | PromiseLike<TRejected>) | null
  ): Promise<TFulfilled | TRejected> {
    return this.exec().then(onfulfilled, onrejected)
  }

  /**
   * Handle rejection
   */
  catch<TRejected = never>(
    onrejected?: ((reason: unknown) => TRejected | PromiseLike<TRejected>) | null
  ): Promise<TResult[] | TRejected> {
    return this.exec().catch(onrejected)
  }

  /**
   * Finally handler
   */
  finally(onfinally?: (() => void) | null): Promise<TResult[]> {
    return this.exec().finally(onfinally)
  }

  /**
   * Return a cursor for iteration
   * This returns an async iterable that can be used with for-await-of
   */
  cursor(): AggregateCursor<TResult> {
    return new AggregateCursor<TResult>(this)
  }

  /**
   * Explain the aggregation execution plan
   */
  async explain(verbosity?: 'queryPlanner' | 'executionStats' | 'allPlansExecution'): Promise<unknown> {
    // Placeholder - would call collection.aggregate with explain option
    return {
      stages: this._pipeline,
      queryPlanner: {},
      executionStats: {},
      verbosity: verbosity || 'queryPlanner',
    }
  }

  /**
   * Convert aggregation to string representation
   */
  toString(): string {
    return `Aggregate { pipeline: ${JSON.stringify(this._pipeline)}, options: ${JSON.stringify(this._options)} }`
  }

  /**
   * Symbol.toStringTag for better debugging
   */
  get [Symbol.toStringTag](): string {
    return 'Aggregate'
  }
}

// ============ AggregateCursor Class ============

/**
 * Cursor for iterating over aggregation results
 * Provides async iteration support for streaming large result sets
 */
export class AggregateCursor<TResult> implements AsyncIterable<TResult> {
  private _aggregate: Aggregate<TResult>
  private _results: TResult[] | null = null
  private _index: number = 0
  private _closed: boolean = false

  constructor(aggregate: Aggregate<TResult>) {
    this._aggregate = aggregate
  }

  /**
   * Close the cursor
   */
  async close(): Promise<void> {
    this._results = null
    this._index = 0
    this._closed = true
  }

  /**
   * Check if the cursor is closed
   */
  get closed(): boolean {
    return this._closed
  }

  /**
   * Check if there are more documents
   */
  async hasNext(): Promise<boolean> {
    if (this._closed) return false
    if (!this._results) {
      this._results = await this._aggregate.clone().exec()
    }
    return this._index < this._results.length
  }

  /**
   * Get the next document
   */
  async next(): Promise<TResult | null> {
    if (this._closed) return null
    if (!this._results) {
      this._results = await this._aggregate.clone().exec()
    }
    if (this._index >= this._results.length) {
      return null
    }
    return this._results[this._index++] ?? null
  }

  /**
   * Execute a function for each document
   * @param fn - The function to execute for each document
   * @param options - Options for parallel processing
   */
  async eachAsync(
    fn: (doc: TResult, index: number) => void | Promise<void>,
    options?: { parallel?: number }
  ): Promise<void> {
    if (this._closed) return
    if (!this._results) {
      this._results = await this._aggregate.clone().exec()
    }

    if (options?.parallel && options.parallel > 1) {
      // Process in parallel batches
      const batchSize = options.parallel
      for (let i = 0; i < this._results.length; i += batchSize) {
        const batch = this._results.slice(i, i + batchSize)
        await Promise.all(batch.map((doc, idx) => fn(doc, i + idx)))
      }
    } else {
      // Process sequentially
      for (let i = 0; i < this._results.length; i++) {
        const doc = this._results[i]
        if (doc !== undefined) {
          await fn(doc, i)
        }
      }
    }
  }

  /**
   * Map documents to a new array
   * @param fn - The mapping function
   */
  async map<T>(fn: (doc: TResult) => T | Promise<T>): Promise<T[]> {
    if (this._closed) return []
    if (!this._results) {
      this._results = await this._aggregate.clone().exec()
    }
    return Promise.all(this._results.map(fn))
  }

  /**
   * Convert cursor to array
   */
  async toArray(): Promise<TResult[]> {
    if (this._closed) return []
    if (!this._results) {
      this._results = await this._aggregate.clone().exec()
    }
    return [...this._results]
  }

  /**
   * Rewind the cursor to the beginning
   */
  rewind(): this {
    this._index = 0
    return this
  }

  /**
   * Add a cursor flag (placeholder for MongoDB cursor flags)
   * @param flag - The flag name
   * @param value - The flag value
   */
  addCursorFlag(flag: string, value: boolean): this {
    // Placeholder for cursor flags
    return this
  }

  /**
   * Make the cursor async iterable
   */
  async *[Symbol.asyncIterator](): AsyncIterator<TResult> {
    if (this._closed) return
    if (!this._results) {
      this._results = await this._aggregate.clone().exec()
    }
    for (const doc of this._results) {
      yield doc
    }
  }
}

// ============ Exports ============

export default Aggregate
