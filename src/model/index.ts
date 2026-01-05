/**
 * Model class - wraps MongoDB collection operations and provides Mongoose-compatible API
 */

import { Document } from '../document/index.js'
import { Query, type QueryOptions, type PopulateOptions } from '../query/index.js'
import { Aggregate } from '../aggregate/index.js'
import { Schema } from '../schema/index.js'
import type { ObjectId } from '../types/index.js'

// ============ Types ============

export interface ModelOptions {
  collection?: string
  connection?: any
  skipInit?: boolean
}

export interface InsertManyOptions {
  ordered?: boolean
  rawResult?: boolean
  session?: any
  lean?: boolean
}

export interface UpdateResult {
  acknowledged: boolean
  modifiedCount: number
  upsertedId?: ObjectId
  upsertedCount: number
  matchedCount: number
}

export interface DeleteResult {
  acknowledged: boolean
  deletedCount: number
}

export interface IndexDefinition {
  fields: Record<string, 1 | -1 | 'text' | '2dsphere'>
  options?: {
    unique?: boolean
    sparse?: boolean
    background?: boolean
    expireAfterSeconds?: number
    name?: string
    partialFilterExpression?: Record<string, any>
  }
}

// ============ Model Registry ============

const modelRegistry = new Map<string, ModelConstructor<any>>()

// ============ Model Class ============

/**
 * Interface for Model constructor (callable as new Model())
 */
export interface ModelConstructor<T extends Record<string, unknown> = Record<string, unknown>> {
  new (doc?: Partial<T>): Document<T> & T

  // Static properties
  schema: Schema<T>
  collection: any  // MongoDB collection placeholder
  modelName: string
  db: any  // Connection placeholder
  baseModelName?: string  // For discriminators
  discriminators?: Map<string, ModelConstructor<any>>  // Discriminator mapping

  // CRUD operations
  create(doc: Partial<T>): Promise<Document<T> & T>
  create(docs: Partial<T>[]): Promise<(Document<T> & T)[]>
  insertMany(docs: Partial<T>[], options?: InsertManyOptions): Promise<(Document<T> & T)[]>

  // Find operations
  find(filter?: Record<string, any>, projection?: Record<string, 0 | 1> | string, options?: QueryOptions): Query<T, (Document<T> & T)[]>
  findOne(filter?: Record<string, any>, projection?: Record<string, 0 | 1> | string, options?: QueryOptions): Query<T, (Document<T> & T) | null>
  findById(id: ObjectId | string, projection?: Record<string, 0 | 1> | string, options?: QueryOptions): Query<T, (Document<T> & T) | null>
  findByIdAndUpdate(id: ObjectId | string, update: Record<string, any>, options?: QueryOptions & { new?: boolean }): Query<T, (Document<T> & T) | null>
  findByIdAndDelete(id: ObjectId | string, options?: QueryOptions): Query<T, (Document<T> & T) | null>
  findOneAndUpdate(filter: Record<string, any>, update: Record<string, any>, options?: QueryOptions & { new?: boolean; upsert?: boolean }): Query<T, (Document<T> & T) | null>
  findOneAndDelete(filter: Record<string, any>, options?: QueryOptions): Query<T, (Document<T> & T) | null>
  findOneAndReplace(filter: Record<string, any>, replacement: Partial<T>, options?: QueryOptions & { new?: boolean; upsert?: boolean }): Query<T, (Document<T> & T) | null>

  // Update operations
  updateOne(filter: Record<string, any>, update: Record<string, any>, options?: QueryOptions & { upsert?: boolean }): Query<T, UpdateResult>
  updateMany(filter: Record<string, any>, update: Record<string, any>, options?: QueryOptions & { upsert?: boolean }): Query<T, UpdateResult>
  replaceOne(filter: Record<string, any>, replacement: Partial<T>, options?: QueryOptions & { upsert?: boolean }): Query<T, UpdateResult>

  // Delete operations
  deleteOne(filter: Record<string, any>, options?: QueryOptions): Query<T, DeleteResult>
  deleteMany(filter: Record<string, any>, options?: QueryOptions): Query<T, DeleteResult>

  // Count and aggregation
  countDocuments(filter?: Record<string, any>): Query<T, number>
  estimatedDocumentCount(): Promise<number>
  distinct(field: string, filter?: Record<string, any>): Query<T, any[]>

  // Document creation
  hydrate(doc: Record<string, any>): Document<T> & T

  // Index management
  createIndexes(): Promise<void>
  ensureIndexes(): Promise<void>
  syncIndexes(): Promise<string[]>
  listIndexes(): Promise<IndexDefinition[]>

  // Utility
  exists(filter: Record<string, any>): Promise<{ _id: ObjectId } | null>
  where(path: string, val?: any): Query<T, (Document<T> & T)[]>

  // Aggregation
  aggregate<R = any>(pipeline?: Record<string, any>[]): Aggregate<R>

  // Bulk operations
  bulkWrite(ops: BulkWriteOperation<T>[], options?: { ordered?: boolean; session?: any }): Promise<BulkWriteResult>

  // Watch changes
  watch(pipeline?: Record<string, any>[], options?: Record<string, any>): ChangeStream<T>

  // Internal methods
  _saveDocument(doc: Document<T>, options?: any): Promise<Document<T>>
  _deleteDocument(doc: Document<T>, options?: any): Promise<Document<T>>
  _populateDocument(doc: Document<T>, path: string | string[] | Record<string, any>): Promise<Document<T>>
}

export interface BulkWriteOperation<T extends Record<string, unknown> = Record<string, unknown>> {
  insertOne?: { document: Partial<T> }
  updateOne?: { filter: Record<string, any>; update: Record<string, any>; upsert?: boolean }
  updateMany?: { filter: Record<string, any>; update: Record<string, any>; upsert?: boolean }
  deleteOne?: { filter: Record<string, any> }
  deleteMany?: { filter: Record<string, any> }
  replaceOne?: { filter: Record<string, any>; replacement: Partial<T>; upsert?: boolean }
}

export interface BulkWriteResult {
  insertedCount: number
  matchedCount: number
  modifiedCount: number
  deletedCount: number
  upsertedCount: number
  upsertedIds: Record<number, ObjectId>
}

export interface ChangeStream<T extends Record<string, unknown> = Record<string, unknown>> {
  on(event: 'change', listener: (change: ChangeEvent<T>) => void): this
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'close', listener: () => void): this
  close(): Promise<void>
  [Symbol.asyncIterator](): AsyncIterator<ChangeEvent<T>>
}

export interface ChangeEvent<T extends Record<string, unknown> = Record<string, unknown>> {
  operationType: 'insert' | 'update' | 'replace' | 'delete' | 'invalidate' | 'drop' | 'dropDatabase' | 'rename'
  fullDocument?: T
  documentKey?: { _id: ObjectId }
  updateDescription?: {
    updatedFields: Record<string, any>
    removedFields: string[]
  }
}

// ============ Model Implementation ============

/**
 * Base Model class with static methods
 */
export class Model<T extends Record<string, unknown> = Record<string, unknown>> {
  /** The schema for this model */
  static schema: Schema<any>

  /** MongoDB collection reference (placeholder) */
  static collection: any = null

  /** The model name */
  static modelName: string = ''

  /** Database connection reference (placeholder) */
  static db: any = null

  /** Base path for discriminators */
  static baseModelName?: string

  /** Discriminator mapping */
  static discriminators?: Map<string, ModelConstructor<any>>

  // ============ CRUD Operations ============

  /**
   * Create one or more documents
   */
  static async create<T extends Record<string, unknown>>(this: ModelConstructor<T>, doc: Partial<T>): Promise<Document<T> & T>
  static async create<T extends Record<string, unknown>>(this: ModelConstructor<T>, docs: Partial<T>[]): Promise<(Document<T> & T)[]>
  static async create<T extends Record<string, unknown>>(this: ModelConstructor<T>, docOrDocs: Partial<T> | Partial<T>[]): Promise<Document<T> & T | (Document<T> & T)[]> {
    if (Array.isArray(docOrDocs)) {
      return this.insertMany(docOrDocs)
    }

    const document = new this(docOrDocs)
    await document.save()
    return document
  }

  /**
   * Insert multiple documents
   */
  static async insertMany<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    docs: Partial<T>[],
    options: InsertManyOptions = {}
  ): Promise<(Document<T> & T)[]> {
    const documents: (Document<T> & T)[] = []

    // Run pre-insertMany middleware
    const preHooks = this.schema.getPreHooks('insertMany')
    for (const hook of preHooks) {
      await new Promise<void>((resolve, reject) => {
        hook.fn.call(this, (err?: Error) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }

    for (const doc of docs) {
      const document = new this(doc)

      // Validate
      const { valid, errors } = await this.schema.validate(document._doc)
      if (!valid && options.ordered !== false) {
        const error = new Error(`Validation failed: ${errors.map(e => e.message).join(', ')}`)
        ;(error as any).errors = errors
        throw error
      }

      document.isNew = false
      documents.push(document)
    }

    // TODO: Actual database insertMany operation

    // Run post-insertMany middleware
    const postHooks = this.schema.getPostHooks('insertMany')
    for (const hook of postHooks) {
      await new Promise<void>((resolve, reject) => {
        hook.fn.call(this, documents, (err?: Error) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }

    return documents
  }

  // ============ Find Operations ============

  /**
   * Find documents matching filter
   */
  static find<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    filter: Record<string, any> = {},
    projection?: Record<string, 0 | 1> | string,
    options?: QueryOptions
  ): Query<T, (Document<T> & T)[]> {
    const query = new Query<T, (Document<T> & T)[]>(this, 'find', filter)

    if (projection) {
      query.select(projection as any)
    }

    if (options) {
      query.setOptions(options)
    }

    return query
  }

  /**
   * Find a single document
   */
  static findOne<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    filter: Record<string, any> = {},
    projection?: Record<string, 0 | 1> | string,
    options?: QueryOptions
  ): Query<T, (Document<T> & T) | null> {
    const query = new Query<T, (Document<T> & T) | null>(this, 'findOne', filter)

    if (projection) {
      query.select(projection as any)
    }

    if (options) {
      query.setOptions(options)
    }

    return query
  }

  /**
   * Find a document by its _id
   */
  static findById<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    id: ObjectId | string,
    projection?: Record<string, 0 | 1> | string,
    options?: QueryOptions
  ): Query<T, (Document<T> & T) | null> {
    return this.findOne({ _id: id }, projection, options)
  }

  /**
   * Find a document by _id and update it
   */
  static findByIdAndUpdate<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    id: ObjectId | string,
    update: Record<string, any>,
    options: QueryOptions & { new?: boolean } = {}
  ): Query<T, (Document<T> & T) | null> {
    return this.findOneAndUpdate({ _id: id }, update, options)
  }

  /**
   * Find a document by _id and delete it
   */
  static findByIdAndDelete<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    id: ObjectId | string,
    options?: QueryOptions
  ): Query<T, (Document<T> & T) | null> {
    return this.findOneAndDelete({ _id: id }, options)
  }

  /**
   * Find a document and update it
   */
  static findOneAndUpdate<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    filter: Record<string, any>,
    update: Record<string, any>,
    options: QueryOptions & { new?: boolean; upsert?: boolean } = {}
  ): Query<T, (Document<T> & T) | null> {
    const query = new Query<T, (Document<T> & T) | null>(this, 'findOneAndUpdate', filter, update)

    if (options) {
      query.setOptions(options)
    }

    return query
  }

  /**
   * Find a document and delete it
   */
  static findOneAndDelete<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    filter: Record<string, any>,
    options?: QueryOptions
  ): Query<T, (Document<T> & T) | null> {
    const query = new Query<T, (Document<T> & T) | null>(this, 'findOneAndDelete', filter)

    if (options) {
      query.setOptions(options)
    }

    return query
  }

  /**
   * Find a document and replace it
   */
  static findOneAndReplace<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    filter: Record<string, any>,
    replacement: Partial<T>,
    options: QueryOptions & { new?: boolean; upsert?: boolean } = {}
  ): Query<T, (Document<T> & T) | null> {
    const query = new Query<T, (Document<T> & T) | null>(this, 'findOneAndUpdate', filter, replacement as Record<string, any>)
    query.setOptions({ ...options, overwrite: true } as any)
    return query
  }

  // ============ Update Operations ============

  /**
   * Update a single document
   */
  static updateOne<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    filter: Record<string, any>,
    update: Record<string, any>,
    options: QueryOptions & { upsert?: boolean } = {}
  ): Query<T, UpdateResult> {
    const query = new Query<T, UpdateResult>(this, 'updateOne', filter, update)

    if (options) {
      query.setOptions(options)
    }

    return query
  }

  /**
   * Update multiple documents
   */
  static updateMany<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    filter: Record<string, any>,
    update: Record<string, any>,
    options: QueryOptions & { upsert?: boolean } = {}
  ): Query<T, UpdateResult> {
    const query = new Query<T, UpdateResult>(this, 'updateMany', filter, update)

    if (options) {
      query.setOptions(options)
    }

    return query
  }

  /**
   * Replace a single document
   */
  static replaceOne<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    filter: Record<string, any>,
    replacement: Partial<T>,
    options: QueryOptions & { upsert?: boolean } = {}
  ): Query<T, UpdateResult> {
    return this.updateOne(filter, replacement as Record<string, any>, { ...options, overwrite: true } as any)
  }

  // ============ Delete Operations ============

  /**
   * Delete a single document
   */
  static deleteOne<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    filter: Record<string, any>,
    options?: QueryOptions
  ): Query<T, DeleteResult> {
    const query = new Query<T, DeleteResult>(this, 'deleteOne', filter)

    if (options) {
      query.setOptions(options)
    }

    return query
  }

  /**
   * Delete multiple documents
   */
  static deleteMany<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    filter: Record<string, any>,
    options?: QueryOptions
  ): Query<T, DeleteResult> {
    const query = new Query<T, DeleteResult>(this, 'deleteMany', filter)

    if (options) {
      query.setOptions(options)
    }

    return query
  }

  // ============ Count and Aggregation ============

  /**
   * Count documents matching filter
   */
  static countDocuments<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    filter: Record<string, any> = {}
  ): Query<T, number> {
    return new Query<T, number>(this, 'count', filter)
  }

  /**
   * Estimated document count (faster, uses collection metadata)
   */
  static async estimatedDocumentCount<T extends Record<string, unknown>>(this: ModelConstructor<T>): Promise<number> {
    // TODO: Actual database operation
    return 0
  }

  /**
   * Get distinct values for a field
   */
  static distinct<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    field: string,
    filter: Record<string, any> = {}
  ): Query<T, any[]> {
    const query = new Query<T, any[]>(this, 'distinct', filter)
    ;(query as any)._distinctField = field
    return query
  }

  /**
   * Check if any document exists matching filter
   */
  static async exists<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    filter: Record<string, any>
  ): Promise<{ _id: ObjectId } | null> {
    const result = await this.findOne(filter).select('_id').lean()
    return result ? { _id: (result as any)._id } : null
  }

  // ============ Document Creation ============

  /**
   * Create a Document instance from a plain object (without saving)
   */
  static hydrate<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    doc: Partial<T>
  ): Document<T> & T {
    const document = new this(doc)
    document.isNew = false
    document.$__.modifiedPaths.clear()
    document.$__.directModifiedPaths.clear()
    return document
  }

  /**
   * Start a query with where clause
   */
  static where<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    path: string,
    val?: any
  ): Query<T, (Document<T> & T)[]> {
    const query = new Query<T, (Document<T> & T)[]>(this, 'find', {})
    return query.where(path, val)
  }

  // ============ Aggregation ============

  /**
   * Start an aggregation pipeline
   */
  static aggregate<T extends Record<string, unknown>, R = any>(
    this: ModelConstructor<T>,
    pipeline: Record<string, any>[] = []
  ): Aggregate<R> {
    return new Aggregate<R>(this, pipeline)
  }

  // ============ Index Management ============

  /**
   * Create indexes defined in the schema
   */
  static async createIndexes<T extends Record<string, unknown>>(this: ModelConstructor<T>): Promise<void> {
    const indexes = this.schema.indexes()

    // Also check for field-level index definitions
    for (const [path, type] of this.schema.paths()) {
      const opts = (type as any)._options || {}
      if (opts.index) {
        indexes.push([
          { [path]: 1 },
          typeof opts.index === 'object' ? opts.index : undefined
        ])
      }
      if (opts.unique) {
        indexes.push([
          { [path]: 1 },
          { unique: true }
        ])
      }
    }

    // TODO: Actual index creation in database
    for (const index of indexes) {
      console.log(`Creating index: ${JSON.stringify(index)}`)
    }
  }

  /**
   * Ensure indexes exist (alias for createIndexes)
   */
  static async ensureIndexes<T extends Record<string, unknown>>(this: ModelConstructor<T>): Promise<void> {
    return this.createIndexes()
  }

  /**
   * Sync indexes - create missing and drop extra indexes
   */
  static async syncIndexes<T extends Record<string, unknown>>(this: ModelConstructor<T>): Promise<string[]> {
    // TODO: Actual index sync with database
    await this.createIndexes()
    return []
  }

  /**
   * List all indexes
   */
  static async listIndexes<T extends Record<string, unknown>>(this: ModelConstructor<T>): Promise<IndexDefinition[]> {
    // TODO: Get actual indexes from database
    // Convert from Mongoose [fields, options] format to IndexDefinition objects
    return this.schema.indexes().map(([fields, options]) => ({
      fields: fields as Record<string, 1 | -1 | 'text' | '2dsphere'>,
      options,
    }))
  }

  // ============ Bulk Operations ============

  /**
   * Execute bulk write operations
   */
  static async bulkWrite<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    ops: BulkWriteOperation<T>[],
    options: { ordered?: boolean; session?: any } = {}
  ): Promise<BulkWriteResult> {
    // TODO: Actual bulk write implementation
    const result: BulkWriteResult = {
      insertedCount: 0,
      matchedCount: 0,
      modifiedCount: 0,
      deletedCount: 0,
      upsertedCount: 0,
      upsertedIds: {}
    }

    for (const op of ops) {
      if (op.insertOne) {
        result.insertedCount++
      } else if (op.updateOne || op.updateMany) {
        result.matchedCount++
        result.modifiedCount++
      } else if (op.deleteOne || op.deleteMany) {
        result.deletedCount++
      } else if (op.replaceOne) {
        result.matchedCount++
        result.modifiedCount++
      }
    }

    return result
  }

  // ============ Change Streams ============

  /**
   * Watch for changes on the collection
   */
  static watch<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    pipeline: Record<string, any>[] = [],
    options: Record<string, any> = {}
  ): ChangeStream<T> {
    // TODO: Actual change stream implementation
    const listeners = new Map<string, Function[]>()

    return {
      on(event: string, listener: Function) {
        if (!listeners.has(event)) {
          listeners.set(event, [])
        }
        listeners.get(event)!.push(listener)
        return this
      },
      async close() {
        listeners.clear()
      },
      async *[Symbol.asyncIterator]() {
        // Placeholder - would yield actual change events
      }
    } as ChangeStream<T>
  }

  // ============ Discriminators ============

  /**
   * Create a discriminator model
   */
  static discriminator<T extends Record<string, unknown>, D extends T>(
    this: ModelConstructor<T>,
    name: string,
    schema: Schema<D>,
    value?: string
  ): ModelConstructor<D> {
    const discriminatorKey = this.schema.get('discriminatorKey') || '__t'
    const discriminatorValue = value || name

    // Clone parent schema and merge with discriminator schema
    const mergedSchema = this.schema.clone() as Schema<D>
    // Convert paths Map to object for add()
    const pathsObj: Record<string, any> = {}
    for (const [key, type] of schema.paths()) {
      pathsObj[key] = type
    }
    mergedSchema.add(pathsObj)

    // Add discriminator key
    mergedSchema.add({
      [discriminatorKey]: { type: String, default: discriminatorValue }
    } as any)

    // Create new model
    const DiscriminatorModel = model<D>(name, mergedSchema)

    // Set base model reference
    ;(DiscriminatorModel as any).baseModelName = this.modelName

    // Register discriminator
    if (!this.discriminators) {
      ;(this as any).discriminators = new Map()
    }
    this.discriminators!.set(discriminatorValue, DiscriminatorModel)

    return DiscriminatorModel
  }

  // ============ Internal Methods ============

  /**
   * Save a document to the database
   * @internal
   */
  static async _saveDocument<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    doc: Document<T>,
    options?: any
  ): Promise<Document<T>> {
    // Run pre-save middleware
    const preHooks = this.schema.getPreHooks('save')
    for (const hook of preHooks) {
      await new Promise<void>((resolve, reject) => {
        hook.fn.call(doc, (err?: Error) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }

    // Validate
    await doc.validate()

    // TODO: Actual database save
    // For new documents: insertOne
    // For existing documents: updateOne with modified fields

    doc.isNew = false
    doc.$__.modifiedPaths.clear()
    doc.$__.directModifiedPaths.clear()
    doc.$__.originalValues.clear()

    // Run post-save middleware
    const postHooks = this.schema.getPostHooks('save')
    for (const hook of postHooks) {
      await new Promise<void>((resolve, reject) => {
        hook.fn.call(doc, doc, (err?: Error) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }

    return doc
  }

  /**
   * Delete a document from the database
   * @internal
   */
  static async _deleteDocument<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    doc: Document<T>,
    options?: any
  ): Promise<Document<T>> {
    // Run pre-remove middleware
    const preHooks = this.schema.getPreHooks('remove')
    for (const hook of preHooks) {
      await new Promise<void>((resolve, reject) => {
        hook.fn.call(doc, (err?: Error) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }

    // TODO: Actual database delete
    doc.$markDeleted()

    // Run post-remove middleware
    const postHooks = this.schema.getPostHooks('remove')
    for (const hook of postHooks) {
      await new Promise<void>((resolve, reject) => {
        hook.fn.call(doc, doc, (err?: Error) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }

    return doc
  }

  /**
   * Populate a document
   * @internal
   */
  static async _populateDocument<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    doc: Document<T>,
    path: string | string[] | Record<string, any>
  ): Promise<Document<T>> {
    // TODO: Actual population logic
    // 1. Parse path to get field and options
    // 2. Look up ref model
    // 3. Query referenced documents
    // 4. Replace ObjectIds with documents
    // 5. Track in populated map

    return doc
  }

  // ============ Utility Methods ============

  /**
   * Translate aliases in an update document
   */
  static translateAliases<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    raw: Record<string, any>
  ): Record<string, any> {
    // TODO: Implement alias translation
    return raw
  }

  /**
   * Validate paths
   */
  static async validate<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    obj: Partial<T>,
    paths?: string[]
  ): Promise<void> {
    const doc = new this(obj)
    await doc.validate()
  }

  /**
   * Cast a filter to proper types
   */
  static castObject<T extends Record<string, unknown>>(
    this: ModelConstructor<T>,
    obj: Record<string, any>
  ): Record<string, any> {
    return this.schema.cast(obj)
  }
}

// ============ Model Factory Function ============

/**
 * Create a new model from a schema
 */
export function model<T extends Record<string, unknown> = Record<string, unknown>>(
  name: string,
  schema: Schema<T>,
  options: ModelOptions = {}
): ModelConstructor<T> {
  // Check if model already exists
  if (modelRegistry.has(name) && !options.skipInit) {
    return modelRegistry.get(name)! as ModelConstructor<T>
  }

  // Determine collection name
  const collectionName = options.collection || schema.get('collection') || pluralize(name.toLowerCase())

  // Apply schema statics to the model
  const statics = schema.statics

  // Create the model class dynamically
  const ModelClass = class extends Model<T> {
    static override schema = schema
    static override modelName = name
    static override collection = null // Will be set when connected
    static override db = options.connection || null

    constructor(doc: Partial<T> = {}) {
      super()

      // Create document instance
      const document = new Document<T>(doc, schema, true)
      document.$__.model = ModelClass

      // Apply instance methods from schema
      const methods = schema.methods
      for (const [methodName, fn] of Object.entries(methods)) {
        ;(document as any)[methodName] = fn.bind(document)
      }

      return document as any
    }
  }

  // Apply static methods from schema
  for (const [methodName, fn] of Object.entries(statics)) {
    ;(ModelClass as any)[methodName] = fn
  }

  // Set internal collection name for later use
  ;(ModelClass as any)._collectionName = collectionName

  // Register model
  modelRegistry.set(name, ModelClass as unknown as ModelConstructor<any>)

  return ModelClass as unknown as ModelConstructor<T>
}

/**
 * Get a registered model by name
 */
export function getModel<T extends Record<string, unknown> = Record<string, unknown>>(name: string): ModelConstructor<T> | undefined {
  return modelRegistry.get(name) as ModelConstructor<T> | undefined
}

/**
 * Check if a model is registered
 */
export function hasModel(name: string): boolean {
  return modelRegistry.has(name)
}

/**
 * Delete a registered model
 */
export function deleteModel(name: string): boolean {
  return modelRegistry.delete(name)
}

/**
 * Get all registered model names
 */
export function modelNames(): string[] {
  return Array.from(modelRegistry.keys())
}

// ============ Utility Functions ============

/**
 * Simple pluralization (basic implementation)
 */
function pluralize(word: string): string {
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z') ||
      word.endsWith('ch') || word.endsWith('sh')) {
    return word + 'es'
  }
  if (word.endsWith('y') && !['a', 'e', 'i', 'o', 'u'].includes(word[word.length - 2] ?? '')) {
    return word.slice(0, -1) + 'ies'
  }
  return word + 's'
}

// ============ Exports ============

export default Model
