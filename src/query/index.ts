/**
 * Query Builder - Chainable query construction for Mongoose.do
 *
 * @example
 * ```typescript
 * // Basic query
 * const users = await User.find({ age: { $gte: 18 } })
 *
 * // Chained query
 * const users = await User
 *   .find()
 *   .where('age').gte(18)
 *   .where('role').in(['admin', 'user'])
 *   .select('name email')
 *   .sort({ createdAt: -1 })
 *   .limit(10)
 *   .lean()
 * ```
 */

import type { ObjectId } from 'mongo.do'

// ============ Types ============

/**
 * Query operation types
 */
export type QueryOperation =
  | 'find'
  | 'findOne'
  | 'findOneAndUpdate'
  | 'findOneAndDelete'
  | 'findOneAndReplace'
  | 'updateOne'
  | 'updateMany'
  | 'deleteOne'
  | 'deleteMany'
  | 'count'
  | 'countDocuments'
  | 'estimatedDocumentCount'
  | 'distinct'

/**
 * Filter operators for queries
 */
export interface FilterOperators<T = unknown> {
  $eq?: T
  $ne?: T
  $gt?: T
  $gte?: T
  $lt?: T
  $lte?: T
  $in?: T[]
  $nin?: T[]
  $exists?: boolean
  $regex?: RegExp | string
  $not?: FilterOperators<T>
  $elemMatch?: Record<string, unknown>
  $size?: number
  $all?: T[]
  $type?: string | number
  $mod?: [number, number]
}

/**
 * Root query filter type
 */
export type FilterQuery<T> = {
  [P in keyof T]?: T[P] | FilterOperators<T[P]>
} & {
  $and?: FilterQuery<T>[]
  $or?: FilterQuery<T>[]
  $nor?: FilterQuery<T>[]
  $not?: FilterQuery<T>
  $text?: { $search: string; $language?: string; $caseSensitive?: boolean }
  $where?: string | Function
  $comment?: string
}

/**
 * Population options
 */
export interface PopulateOptions {
  path: string
  select?: string | string[] | Record<string, 0 | 1>
  match?: Record<string, unknown>
  model?: string
  options?: QueryOptions
  populate?: PopulateOptions | PopulateOptions[] | string
  justOne?: boolean
  localField?: string
  foreignField?: string
}

/**
 * Query options (sort, skip, limit, etc.)
 */
export interface QueryOptions {
  lean?: boolean
  populate?: string | string[] | PopulateOptions | PopulateOptions[]
  select?: string | Record<string, 0 | 1>
  sort?: string | Record<string, 1 | -1 | 'asc' | 'desc'>
  limit?: number
  skip?: number
  projection?: Record<string, 0 | 1>
  new?: boolean
  upsert?: boolean
  session?: unknown // ClientSession type from mondodb
  timestamps?: boolean
  strict?: boolean
  batchSize?: number
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
  hint?: Record<string, 1 | -1> | string
  maxTimeMS?: number
  readPreference?: string
  comment?: string
  tailable?: boolean
  awaitData?: boolean
  allowDiskUse?: boolean
}

/**
 * Model interface (placeholder - will be replaced by actual Model type)
 */
export interface ModelLike<T = unknown> {
  collection?: {
    find(filter: FilterQuery<T>, options?: QueryOptions): Promise<T[]>
    findOne(filter: FilterQuery<T>, options?: QueryOptions): Promise<T | null>
    countDocuments(filter: FilterQuery<T>): Promise<number>
    estimatedDocumentCount(): Promise<number>
    distinct(field: string, filter?: FilterQuery<T>): Promise<unknown[]>
  }
  modelName?: string
  schema?: {
    getPreHooks(hook: string): Array<{ fn: Function; options?: { query?: boolean } }>
    getPostHooks(hook: string): Array<{ fn: Function; options?: { query?: boolean } }>
  }
  hydrate?(doc: unknown): T
}

// ============ Query Class ============

/**
 * Chainable query builder for Mongoose.do
 *
 * The Query class is LAZY - it doesn't execute until:
 * - exec() is called
 * - then() is called (await/Promise chain)
 * - A terminal method is called
 *
 * @template TDoc - The document type
 * @template TResult - The expected result type
 */
export class Query<TDoc = unknown, TResult = TDoc> implements PromiseLike<TResult> {
  // ============ Query State ============

  /** The query filter object */
  private _filter: FilterQuery<TDoc>

  /** Fields to select/exclude (projection) */
  private _projection: Record<string, 0 | 1> | null = null

  /** Query options (sort, skip, limit, etc.) */
  private _options: QueryOptions = {}

  /** Population options */
  private _populate: PopulateOptions[] = []

  /** Whether to return plain objects */
  private _lean: boolean = false

  /** Reference to the Model */
  private _model: ModelLike<TDoc>

  /** The query operation type */
  private _operation: QueryOperation

  /** Current path for chained conditions (where().equals()) */
  private _currentPath: string | null = null

  /** Update document for update operations */
  private _update: Record<string, unknown> | null = null

  /** Distinct field for distinct queries */
  private _distinctField: string | null = null

  // ============ Constructor ============

  /**
   * Create a new Query instance
   * @param model - The model to query against
   * @param operation - The query operation type
   * @param filter - Initial filter conditions
   * @param update - Update document for update operations
   */
  constructor(
    model: ModelLike<TDoc>,
    operation: QueryOperation = 'find',
    filter: FilterQuery<TDoc> = {},
    update?: Record<string, unknown>
  ) {
    this._model = model
    this._operation = operation
    this._filter = filter
    this._update = update ?? null
  }

  // ============ Static Factory Methods ============

  /**
   * Create a find query
   */
  static find<T>(model: ModelLike<T>, filter?: FilterQuery<T>): Query<T, T[]> {
    return new Query<T, T[]>(model, 'find', filter)
  }

  /**
   * Create a findOne query
   */
  static findOne<T>(model: ModelLike<T>, filter?: FilterQuery<T>): Query<T, T | null> {
    return new Query<T, T | null>(model, 'findOne', filter)
  }

  /**
   * Create a countDocuments query
   */
  static countDocuments<T>(model: ModelLike<T>, filter?: FilterQuery<T>): Query<T, number> {
    return new Query<T, number>(model, 'countDocuments', filter)
  }

  /**
   * Create an estimatedDocumentCount query
   */
  static estimatedDocumentCount<T>(model: ModelLike<T>): Query<T, number> {
    return new Query<T, number>(model, 'estimatedDocumentCount', {})
  }

  /**
   * Create a distinct query
   */
  static distinct<T>(model: ModelLike<T>, field: string, filter?: FilterQuery<T>): Query<T, unknown[]> {
    const query = new Query<T, unknown[]>(model, 'distinct', filter)
    query._distinctField = field
    return query
  }

  // ============ Chainable Filter Methods ============

  /**
   * Start building a condition on a path or add filter conditions
   * @param path - The document path to query, or an object of conditions
   * @param val - Optional direct value (Mongoose-style shorthand)
   * @example query.where('age').gte(18)
   * @example query.where({ name: 'John', age: 30 })
   * @example query.where('name', 'John')
   */
  where(path: string, val?: unknown): this
  where(obj: Record<string, unknown>): this
  where(pathOrObj: string | Record<string, unknown>, val?: unknown): this {
    if (typeof pathOrObj === 'string') {
      if (val !== undefined) {
        // Direct value assignment: where('name', 'John')
        (this._filter as Record<string, unknown>)[pathOrObj] = val
      } else {
        // Start chained condition: where('age').gte(18)
        this._currentPath = pathOrObj
      }
    } else {
      // Object of conditions: where({ name: 'John' })
      Object.assign(this._filter, pathOrObj)
    }
    return this
  }

  /**
   * Add an equals condition
   * @param val - The value to match
   */
  equals<V>(val: V): this {
    this._setPathCondition('$eq', val)
    return this
  }

  /**
   * Alias for equals
   */
  eq<V>(val: V): this {
    return this.equals(val)
  }

  /**
   * Add a greater-than condition
   * @param val - The minimum value (exclusive)
   */
  gt(val: number): this
  gt(path: string, val: number): this
  gt(pathOrVal: string | number, val?: number): this {
    if (typeof pathOrVal === 'string' && val !== undefined) {
      this._filter[pathOrVal as keyof FilterQuery<TDoc>] = {
        ...(this._filter[pathOrVal as keyof FilterQuery<TDoc>] as object || {}),
        $gt: val
      } as FilterQuery<TDoc>[keyof FilterQuery<TDoc>]
    } else {
      this._setPathCondition('$gt', pathOrVal)
    }
    return this
  }

  /**
   * Add a greater-than-or-equal condition
   * @param val - The minimum value (inclusive)
   */
  gte(val: number): this
  gte(path: string, val: number): this
  gte(pathOrVal: string | number, val?: number): this {
    if (typeof pathOrVal === 'string' && val !== undefined) {
      this._filter[pathOrVal as keyof FilterQuery<TDoc>] = {
        ...(this._filter[pathOrVal as keyof FilterQuery<TDoc>] as object || {}),
        $gte: val
      } as FilterQuery<TDoc>[keyof FilterQuery<TDoc>]
    } else {
      this._setPathCondition('$gte', pathOrVal)
    }
    return this
  }

  /**
   * Add a less-than condition
   * @param val - The maximum value (exclusive)
   */
  lt(val: number): this
  lt(path: string, val: number): this
  lt(pathOrVal: string | number, val?: number): this {
    if (typeof pathOrVal === 'string' && val !== undefined) {
      this._filter[pathOrVal as keyof FilterQuery<TDoc>] = {
        ...(this._filter[pathOrVal as keyof FilterQuery<TDoc>] as object || {}),
        $lt: val
      } as FilterQuery<TDoc>[keyof FilterQuery<TDoc>]
    } else {
      this._setPathCondition('$lt', pathOrVal)
    }
    return this
  }

  /**
   * Add a less-than-or-equal condition
   * @param val - The maximum value (inclusive)
   */
  lte(val: number): this
  lte(path: string, val: number): this
  lte(pathOrVal: string | number, val?: number): this {
    if (typeof pathOrVal === 'string' && val !== undefined) {
      this._filter[pathOrVal as keyof FilterQuery<TDoc>] = {
        ...(this._filter[pathOrVal as keyof FilterQuery<TDoc>] as object || {}),
        $lte: val
      } as FilterQuery<TDoc>[keyof FilterQuery<TDoc>]
    } else {
      this._setPathCondition('$lte', pathOrVal)
    }
    return this
  }

  /**
   * Add a not-equal condition
   * @param val - The value to not match
   */
  ne<V>(val: V): this
  ne<V>(path: string, val: V): this
  ne<V>(pathOrVal: string | V, val?: V): this {
    if (typeof pathOrVal === 'string' && val !== undefined) {
      this._filter[pathOrVal as keyof FilterQuery<TDoc>] = {
        ...(this._filter[pathOrVal as keyof FilterQuery<TDoc>] as object || {}),
        $ne: val
      } as FilterQuery<TDoc>[keyof FilterQuery<TDoc>]
    } else {
      this._setPathCondition('$ne', pathOrVal)
    }
    return this
  }

  /**
   * Add an $in condition (value must be in array)
   * @param vals - Array of acceptable values
   */
  in<V>(vals: V[]): this
  in<V>(path: string, vals: V[]): this
  in<V>(pathOrVals: string | V[], vals?: V[]): this {
    if (typeof pathOrVals === 'string' && vals !== undefined) {
      this._filter[pathOrVals as keyof FilterQuery<TDoc>] = {
        ...(this._filter[pathOrVals as keyof FilterQuery<TDoc>] as object || {}),
        $in: vals
      } as FilterQuery<TDoc>[keyof FilterQuery<TDoc>]
    } else {
      this._setPathCondition('$in', pathOrVals)
    }
    return this
  }

  /**
   * Add a $nin condition (value must not be in array)
   * @param vals - Array of unacceptable values
   */
  nin<V>(vals: V[]): this
  nin<V>(path: string, vals: V[]): this
  nin<V>(pathOrVals: string | V[], vals?: V[]): this {
    if (typeof pathOrVals === 'string' && vals !== undefined) {
      this._filter[pathOrVals as keyof FilterQuery<TDoc>] = {
        ...(this._filter[pathOrVals as keyof FilterQuery<TDoc>] as object || {}),
        $nin: vals
      } as FilterQuery<TDoc>[keyof FilterQuery<TDoc>]
    } else {
      this._setPathCondition('$nin', pathOrVals)
    }
    return this
  }

  /**
   * Add an $exists condition
   * @param exists - Whether the field must exist
   */
  exists(exists?: boolean): this
  exists(path: string, exists?: boolean): this
  exists(pathOrExists?: string | boolean, exists?: boolean): this {
    if (typeof pathOrExists === 'string') {
      this._filter[pathOrExists as keyof FilterQuery<TDoc>] = {
        ...(this._filter[pathOrExists as keyof FilterQuery<TDoc>] as object || {}),
        $exists: exists ?? true
      } as FilterQuery<TDoc>[keyof FilterQuery<TDoc>]
    } else {
      this._setPathCondition('$exists', pathOrExists ?? true)
    }
    return this
  }

  /**
   * Add a $regex condition
   * @param pattern - The regex pattern to match
   * @param flags - Optional regex flags
   */
  regex(pattern: RegExp | string, flags?: string): this
  regex(path: string, pattern: RegExp | string, flags?: string): this
  regex(pathOrPattern: string | RegExp, patternOrFlags?: RegExp | string, flags?: string): this {
    if (typeof pathOrPattern === 'string' && (patternOrFlags instanceof RegExp || typeof patternOrFlags === 'string')) {
      // Two-arg form: regex('path', /pattern/) or regex('path', 'pattern', 'flags')
      let regexValue: RegExp | string = patternOrFlags
      if (typeof patternOrFlags === 'string' && flags) {
        regexValue = new RegExp(patternOrFlags, flags)
      }
      this._filter[pathOrPattern as keyof FilterQuery<TDoc>] = {
        ...(this._filter[pathOrPattern as keyof FilterQuery<TDoc>] as object || {}),
        $regex: regexValue
      } as FilterQuery<TDoc>[keyof FilterQuery<TDoc>]
    } else {
      // Chained form: where('field').regex(/pattern/)
      let regexValue: RegExp | string = pathOrPattern
      if (typeof pathOrPattern === 'string' && typeof patternOrFlags === 'string') {
        regexValue = new RegExp(pathOrPattern, patternOrFlags)
      }
      this._setPathCondition('$regex', regexValue)
    }
    return this
  }

  /**
   * Add an $elemMatch condition for arrays
   * @param criteria - The criteria for matching array elements
   */
  elemMatch(criteria: Record<string, unknown>): this
  elemMatch(path: string, criteria: Record<string, unknown>): this
  elemMatch(pathOrCriteria: string | Record<string, unknown>, criteria?: Record<string, unknown>): this {
    if (typeof pathOrCriteria === 'string' && criteria !== undefined) {
      this._filter[pathOrCriteria as keyof FilterQuery<TDoc>] = {
        ...(this._filter[pathOrCriteria as keyof FilterQuery<TDoc>] as object || {}),
        $elemMatch: criteria
      } as FilterQuery<TDoc>[keyof FilterQuery<TDoc>]
    } else {
      this._setPathCondition('$elemMatch', pathOrCriteria)
    }
    return this
  }

  /**
   * Add a $size condition for arrays
   * @param n - The exact array size to match
   */
  size(n: number): this
  size(path: string, n: number): this
  size(pathOrN: string | number, n?: number): this {
    if (typeof pathOrN === 'string' && n !== undefined) {
      this._filter[pathOrN as keyof FilterQuery<TDoc>] = {
        ...(this._filter[pathOrN as keyof FilterQuery<TDoc>] as object || {}),
        $size: n
      } as FilterQuery<TDoc>[keyof FilterQuery<TDoc>]
    } else {
      this._setPathCondition('$size', pathOrN)
    }
    return this
  }

  /**
   * Add an $all condition for arrays (must contain all values)
   * @param arr - Array of values that must all be present
   */
  all<V>(arr: V[]): this
  all<V>(path: string, arr: V[]): this
  all<V>(pathOrArr: string | V[], arr?: V[]): this {
    if (typeof pathOrArr === 'string' && arr !== undefined) {
      this._filter[pathOrArr as keyof FilterQuery<TDoc>] = {
        ...(this._filter[pathOrArr as keyof FilterQuery<TDoc>] as object || {}),
        $all: arr
      } as FilterQuery<TDoc>[keyof FilterQuery<TDoc>]
    } else {
      this._setPathCondition('$all', pathOrArr)
    }
    return this
  }

  /**
   * Add a $mod condition
   * @param divisor - The divisor
   * @param remainder - The expected remainder
   */
  mod(divisor: number, remainder: number): this
  mod(path: string, divisor: number, remainder: number): this
  mod(pathOrDivisor: string | number, divisorOrRemainder: number, remainder?: number): this {
    if (typeof pathOrDivisor === 'string' && remainder !== undefined) {
      this._filter[pathOrDivisor as keyof FilterQuery<TDoc>] = {
        ...(this._filter[pathOrDivisor as keyof FilterQuery<TDoc>] as object || {}),
        $mod: [divisorOrRemainder, remainder]
      } as FilterQuery<TDoc>[keyof FilterQuery<TDoc>]
    } else {
      this._setPathCondition('$mod', [pathOrDivisor as number, divisorOrRemainder])
    }
    return this
  }

  /**
   * Add conditions using $and
   * @param conditions - Array of conditions to AND together
   */
  and(conditions: FilterQuery<TDoc>[]): this {
    if (!this._filter.$and) {
      this._filter.$and = []
    }
    this._filter.$and.push(...conditions)
    return this
  }

  /**
   * Add conditions using $or
   * @param conditions - Array of conditions to OR together
   */
  or(conditions: FilterQuery<TDoc>[]): this {
    if (!this._filter.$or) {
      this._filter.$or = []
    }
    this._filter.$or.push(...conditions)
    return this
  }

  /**
   * Add conditions using $nor
   * @param conditions - Array of conditions to NOR together
   */
  nor(conditions: FilterQuery<TDoc>[]): this {
    if (!this._filter.$nor) {
      this._filter.$nor = []
    }
    this._filter.$nor.push(...conditions)
    return this
  }

  // ============ Chainable Options ============

  /**
   * Set fields to select (projection)
   * @param fields - Fields to include/exclude
   * @example query.select('name email') // include name and email
   * @example query.select('-password') // exclude password
   * @example query.select({ name: 1, email: 1 }) // include name and email
   * @example query.select(['name', 'email']) // include name and email
   */
  select(fields: string | string[] | Record<string, 0 | 1>): this {
    if (typeof fields === 'string') {
      this._projection = this._parseProjectionString(fields)
    } else if (Array.isArray(fields)) {
      this._projection = {}
      for (const field of fields) {
        if (field.startsWith('-')) {
          this._projection[field.slice(1)] = 0
        } else if (field.startsWith('+')) {
          this._projection[field.slice(1)] = 1
        } else {
          this._projection[field] = 1
        }
      }
    } else {
      this._projection = fields
    }
    this._options.projection = this._projection!
    return this
  }

  /**
   * Alias for select
   */
  projection(fields: string | string[] | Record<string, 0 | 1>): this {
    return this.select(fields)
  }

  /**
   * Set sort order
   * @param order - Sort specification
   * @example query.sort({ createdAt: -1 }) // descending
   * @example query.sort('name -createdAt') // name asc, createdAt desc
   * @example query.sort([['name', 1], ['createdAt', -1]])
   */
  sort(order: string | Record<string, 1 | -1 | 'asc' | 'desc'> | [string, 1 | -1 | 'asc' | 'desc'][]): this {
    if (typeof order === 'string') {
      this._options.sort = this._parseSortString(order)
    } else if (Array.isArray(order)) {
      const sortObj: Record<string, 1 | -1> = {}
      for (const [field, direction] of order) {
        sortObj[field] = this._normalizeSortOrder(direction)
      }
      this._options.sort = sortObj
    } else {
      const sortObj: Record<string, 1 | -1> = {}
      for (const [key, value] of Object.entries(order)) {
        sortObj[key] = this._normalizeSortOrder(value)
      }
      this._options.sort = sortObj
    }
    return this
  }

  /**
   * Set the maximum number of documents to return
   * @param n - The maximum number of documents
   */
  limit(n: number): this {
    this._options.limit = n
    return this
  }

  /**
   * Set the number of documents to skip
   * @param n - The number of documents to skip
   */
  skip(n: number): this {
    this._options.skip = n
    return this
  }

  /**
   * Enable lean mode - return plain JavaScript objects instead of Mongoose.do documents
   * @param lean - Whether to enable lean mode (default: true)
   */
  lean<LeanResult = TResult>(lean: boolean = true): Query<TDoc, LeanResult> {
    this._lean = lean
    this._options.lean = lean
    return this as unknown as Query<TDoc, LeanResult>
  }

  /**
   * Add population for referenced documents
   * @param path - The path to populate, or population options
   * @param select - Optional fields to select in populated documents
   * @param options - Additional population options
   */
  populate(
    path: string | PopulateOptions | PopulateOptions[],
    select?: string | string[] | Record<string, 0 | 1>,
    options?: Partial<PopulateOptions>
  ): this {
    if (typeof path === 'string') {
      const populateOpts: PopulateOptions = {
        path,
        ...options,
      }
      if (select !== undefined) {
        populateOpts.select = select
      }
      this._populate.push(populateOpts)
    } else if (Array.isArray(path)) {
      this._populate.push(...path)
    } else {
      this._populate.push(path)
    }
    this._options.populate = this._populate
    return this
  }

  /**
   * Set the MongoDB session for transactions
   * @param clientSession - The client session
   */
  session(clientSession: unknown): this {
    this._options.session = clientSession
    return this
  }

  /**
   * Set batch size for cursor iteration
   * @param size - The batch size
   */
  batchSize(size: number): this {
    this._options.batchSize = size
    return this
  }

  /**
   * Set collation options
   * @param collation - The collation options
   */
  collation(collation: QueryOptions['collation']): this {
    this._options.collation = collation
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
   * Set maximum execution time
   * @param ms - Maximum time in milliseconds
   */
  maxTimeMS(ms: number): this {
    this._options.maxTimeMS = ms
    return this
  }

  /**
   * Set read preference
   * @param pref - The read preference
   * @param tags - Optional read preference tags
   */
  read(pref: string, tags?: unknown[]): this {
    this._options.readPreference = pref
    return this
  }

  /**
   * Add a comment to the query
   * @param comment - The comment string
   */
  comment(val: string): this {
    this._options.comment = val
    return this
  }

  /**
   * Create a tailable cursor
   * @param tailable - Whether the cursor is tailable
   * @param awaitData - Whether to await data
   */
  tailable(tailable: boolean = true, awaitData: boolean = true): this {
    this._options.tailable = tailable
    this._options.awaitData = awaitData
    return this
  }

  /**
   * Allow disk use for large sorts
   * @param val - Whether to allow disk use
   */
  allowDiskUse(val: boolean = true): this {
    this._options.allowDiskUse = val
    return this
  }

  // ============ Query Modifiers ============

  /**
   * Set all query options at once
   * @param options - The options object
   */
  setOptions(options: QueryOptions): this {
    Object.assign(this._options, options)
    return this
  }

  /**
   * Set the update document
   * @param update - The update document
   */
  setUpdate(update: Record<string, unknown>): this {
    this._update = update
    return this
  }

  /**
   * Merge another filter or query into this query
   * @param source - The filter or query to merge
   */
  merge(source: Query<TDoc, unknown> | FilterQuery<TDoc>): this {
    if (source instanceof Query) {
      Object.assign(this._filter, source._filter)
      Object.assign(this._options, source._options)
      if (source._projection) {
        this._projection = { ...this._projection, ...source._projection }
      }
      this._populate.push(...source._populate)
    } else {
      Object.assign(this._filter, source)
    }
    return this
  }

  /**
   * Set the entire filter
   * @param filter - The new filter
   */
  setQuery(filter: FilterQuery<TDoc>): this {
    this._filter = filter
    return this
  }

  /**
   * Get the current filter
   */
  getFilter(): FilterQuery<TDoc> {
    return { ...this._filter }
  }

  /**
   * Alias for getFilter
   */
  getQuery(): FilterQuery<TDoc> {
    return this.getFilter()
  }

  /**
   * Get the current options
   */
  getOptions(): QueryOptions {
    return { ...this._options }
  }

  /**
   * Get the current projection
   */
  getProjection(): Record<string, 0 | 1> | null {
    return this._projection ? { ...this._projection } : null
  }

  /**
   * Get the population options
   */
  getPopulate(): PopulateOptions[] {
    return [...this._populate]
  }

  /**
   * Get the update document
   */
  getUpdate(): Record<string, unknown> | null {
    return this._update ? { ...this._update } : null
  }

  /**
   * Get the query operation type
   */
  op(): QueryOperation {
    return this._operation
  }

  /**
   * Get the model
   */
  model(): ModelLike<TDoc> {
    return this._model
  }

  /**
   * Clone this query
   */
  clone(): Query<TDoc, TResult> {
    const cloned = new Query<TDoc, TResult>(
      this._model,
      this._operation,
      { ...this._filter },
      this._update ? { ...this._update } : undefined
    )
    cloned._projection = this._projection ? { ...this._projection } : null
    cloned._options = { ...this._options }
    cloned._populate = [...this._populate]
    cloned._lean = this._lean
    cloned._currentPath = this._currentPath
    cloned._distinctField = this._distinctField
    return cloned
  }

  // ============ Execution ============

  /**
   * Execute the query and return a Promise
   */
  async exec(): Promise<TResult> {
    // Run pre-hooks if schema exists
    const schema = this._model.schema
    if (schema) {
      const hookName = this._getHookName()
      const preHooks = schema.getPreHooks(hookName)
      for (const hook of preHooks) {
        if (hook.options?.query !== false) {
          await new Promise<void>((resolve, reject) => {
            hook.fn.call(this, (err?: Error) => {
              if (err) reject(err)
              else resolve()
            })
          })
        }
      }
    }

    // Execute the actual query
    let result: unknown

    const collection = this._model.collection
    const filter = this._filter
    const options = this._buildOptions()

    if (collection) {
      switch (this._operation) {
        case 'find':
          result = await collection.find(filter, options)
          break

        case 'findOne':
          result = await collection.findOne(filter, options)
          break

        case 'count':
        case 'countDocuments':
          result = await collection.countDocuments(filter)
          break

        case 'estimatedDocumentCount':
          result = await collection.estimatedDocumentCount()
          break

        case 'distinct':
          result = await collection.distinct(this._distinctField!, filter)
          break

        default:
          // Placeholder for other operations
          result = this._getPlaceholderResult()
      }
    } else {
      // Placeholder when no collection is available
      result = this._getPlaceholderResult()
    }

    // Apply population if needed
    if (this._populate.length > 0 && result) {
      result = await this._applyPopulate(result)
    }

    // Hydrate documents if not lean mode and hydrate function exists
    if (!this._lean && result && this._model.hydrate) {
      if (Array.isArray(result)) {
        result = result.map((doc) => this._model.hydrate!(doc))
      } else if (typeof result === 'object' && result !== null) {
        result = this._model.hydrate(result)
      }
    }

    // Run post-hooks if schema exists
    if (schema) {
      const hookName = this._getHookName()
      const postHooks = schema.getPostHooks(hookName)
      for (const hook of postHooks) {
        if (hook.options?.query !== false) {
          await new Promise<void>((resolve, reject) => {
            hook.fn.call(this, result, (err?: Error) => {
              if (err) reject(err)
              else resolve()
            })
          })
        }
      }
    }

    return result as TResult
  }

  /**
   * Make the query thenable (allows await/Promise chain)
   */
  then<TFulfilled = TResult, TRejected = never>(
    onfulfilled?: ((value: TResult) => TFulfilled | PromiseLike<TFulfilled>) | null,
    onrejected?: ((reason: unknown) => TRejected | PromiseLike<TRejected>) | null
  ): Promise<TFulfilled | TRejected> {
    return this.exec().then(onfulfilled, onrejected)
  }

  /**
   * Handle rejection
   */
  catch<TRejected = never>(
    onrejected?: ((reason: unknown) => TRejected | PromiseLike<TRejected>) | null
  ): Promise<TResult | TRejected> {
    return this.exec().catch(onrejected)
  }

  /**
   * Finally handler
   */
  finally(onfinally?: (() => void) | null): Promise<TResult> {
    return this.exec().finally(onfinally)
  }

  /**
   * Return a cursor for iteration (placeholder)
   * This returns an async iterable that can be used with for-await-of
   */
  cursor(): QueryCursor<TDoc> {
    return new QueryCursor<TDoc>(this as unknown as Query<TDoc, TDoc[]>)
  }

  /**
   * Count documents matching the query
   */
  countDocuments(): Query<TDoc, number> {
    return new Query<TDoc, number>(this._model, 'countDocuments', this._filter)
  }

  /**
   * Explain the query execution plan
   */
  async explain(verbosity?: 'queryPlanner' | 'executionStats' | 'allPlansExecution'): Promise<unknown> {
    // Placeholder - would call collection.explain()
    return {
      queryPlanner: {},
      executionStats: {},
      verbosity: verbosity || 'queryPlanner',
    }
  }

  /**
   * Convert query to string representation
   */
  toString(): string {
    return `Query { op: ${this._operation}, filter: ${JSON.stringify(this._filter)}, options: ${JSON.stringify(this._options)} }`
  }

  // ============ Private Helpers ============

  /**
   * Set a condition on the current path
   */
  private _setPathCondition(operator: string, value: unknown): void {
    const path = this._currentPath
    if (!path) {
      throw new Error('Cannot set condition without a path. Call where() first.')
    }

    const existing = this._filter[path as keyof FilterQuery<TDoc>]
    if (existing && typeof existing === 'object' && existing !== null) {
      (this._filter as Record<string, Record<string, unknown>>)[path] = {
        ...existing as object,
        [operator]: value
      }
    } else {
      (this._filter as Record<string, unknown>)[path] = { [operator]: value }
    }
  }

  /**
   * Parse a projection string into an object
   */
  private _parseProjectionString(str: string): Record<string, 0 | 1> {
    const projection: Record<string, 0 | 1> = {}
    const fields = str.split(/\s+/)

    for (const field of fields) {
      if (!field) continue
      if (field.startsWith('-')) {
        projection[field.slice(1)] = 0
      } else if (field.startsWith('+')) {
        projection[field.slice(1)] = 1
      } else {
        projection[field] = 1
      }
    }

    return projection
  }

  /**
   * Parse a sort string into an object
   */
  private _parseSortString(str: string): Record<string, 1 | -1> {
    const sort: Record<string, 1 | -1> = {}
    const fields = str.split(/\s+/)

    for (const field of fields) {
      if (!field) continue
      if (field.startsWith('-')) {
        sort[field.slice(1)] = -1
      } else if (field.startsWith('+')) {
        sort[field.slice(1)] = 1
      } else {
        sort[field] = 1
      }
    }

    return sort
  }

  /**
   * Normalize sort order to 1 or -1
   */
  private _normalizeSortOrder(order: 1 | -1 | 'asc' | 'desc'): 1 | -1 {
    if (order === 1 || order === 'asc') {
      return 1
    }
    return -1
  }

  /**
   * Build final options object for the driver
   */
  private _buildOptions(): QueryOptions {
    const options: QueryOptions = { ...this._options }

    if (this._projection) {
      options.projection = this._projection
    }

    return options
  }

  /**
   * Get the hook name for the current operation
   */
  private _getHookName(): string {
    switch (this._operation) {
      case 'find':
      case 'findOne':
        return 'find'
      case 'findOneAndUpdate':
        return 'findOneAndUpdate'
      case 'findOneAndDelete':
        return 'findOneAndDelete'
      case 'findOneAndReplace':
        return 'findOneAndReplace'
      case 'updateOne':
      case 'updateMany':
        return 'updateMany'
      case 'deleteOne':
      case 'deleteMany':
        return 'deleteMany'
      default:
        return this._operation
    }
  }

  /**
   * Get placeholder result for when no collection is available
   */
  private _getPlaceholderResult(): unknown {
    switch (this._operation) {
      case 'find':
        return []
      case 'findOne':
      case 'findOneAndUpdate':
      case 'findOneAndDelete':
      case 'findOneAndReplace':
        return null
      case 'updateOne':
      case 'updateMany':
        return { acknowledged: true, modifiedCount: 0, matchedCount: 0 }
      case 'deleteOne':
      case 'deleteMany':
        return { acknowledged: true, deletedCount: 0 }
      case 'count':
      case 'countDocuments':
      case 'estimatedDocumentCount':
        return 0
      case 'distinct':
        return []
      default:
        return null
    }
  }

  /**
   * Apply population to results (placeholder)
   */
  private async _applyPopulate(result: unknown): Promise<unknown> {
    // Population will be implemented in the population module
    // For now, return the result as-is
    return result
  }
}

// ============ QueryCursor Class ============

/**
 * Cursor for iterating over query results
 * Provides async iteration support for streaming large result sets
 */
export class QueryCursor<TDoc> implements AsyncIterable<TDoc> {
  private _query: Query<TDoc, TDoc[]>
  private _results: TDoc[] | null = null
  private _index: number = 0
  private _closed: boolean = false

  constructor(query: Query<TDoc, TDoc[]>) {
    this._query = query
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
      this._results = await this._query.clone().exec()
    }
    return this._index < this._results.length
  }

  /**
   * Get the next document
   */
  async next(): Promise<TDoc | null> {
    if (this._closed) return null
    if (!this._results) {
      this._results = await this._query.clone().exec()
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
    fn: (doc: TDoc, index: number) => void | Promise<void>,
    options?: { parallel?: number }
  ): Promise<void> {
    if (this._closed) return
    if (!this._results) {
      this._results = await this._query.clone().exec()
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
  async map<T>(fn: (doc: TDoc) => T | Promise<T>): Promise<T[]> {
    if (this._closed) return []
    if (!this._results) {
      this._results = await this._query.clone().exec()
    }
    return Promise.all(this._results.map(fn))
  }

  /**
   * Convert cursor to array
   */
  async toArray(): Promise<TDoc[]> {
    if (this._closed) return []
    if (!this._results) {
      this._results = await this._query.clone().exec()
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
  async *[Symbol.asyncIterator](): AsyncIterator<TDoc> {
    if (this._closed) return
    if (!this._results) {
      this._results = await this._query.clone().exec()
    }
    for (const doc of this._results) {
      yield doc
    }
  }
}

// ============ Exports ============

export default Query
