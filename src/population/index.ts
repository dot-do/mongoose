/**
 * Population System for Mongoose.do
 *
 * Handles resolving ObjectId references to full documents with support for:
 * - Single and array ref population
 * - Nested population (populate within populated docs)
 * - Virtual population (reverse lookups via localField/foreignField)
 * - Query deduplication and batch optimization
 * - Circular reference handling
 *
 * @example
 * ```typescript
 * // Basic population
 * const user = await User.findById(id).populate('posts')
 *
 * // Nested population
 * const user = await User.findById(id).populate({
 *   path: 'posts',
 *   populate: { path: 'comments' }
 * })
 *
 * // Virtual population (reverse lookup)
 * const author = await Author.findById(id).populate({
 *   path: 'books',
 *   localField: '_id',
 *   foreignField: 'author'
 * })
 * ```
 */

import type { ObjectId } from '../types/index.js'

// ============ Types ============

/**
 * Options for populating a path
 */
export interface PopulateOptions {
  /** The path to populate */
  path: string

  /** Fields to select in populated documents (projection) */
  select?: string | string[] | Record<string, 0 | 1>

  /** Filter criteria for populated documents */
  match?: Record<string, unknown>

  /** Override the model name from schema ref */
  model?: string

  /** Additional query options (sort, limit, skip) */
  options?: PopulateQueryOptions

  /** Nested population options */
  populate?: PopulateOptions | PopulateOptions[] | string

  /** Force returning single doc (true) or array (false), overrides schema */
  justOne?: boolean

  /** Local field for virtual population (default: path) */
  localField?: string

  /** Foreign field for virtual population */
  foreignField?: string

  /** Transform function applied to each populated doc */
  transform?: (doc: unknown) => unknown

  /** Skip population if condition is false */
  skip?: boolean

  /** Strict mode - throw if ref model not found */
  strictPopulate?: boolean

  /** Limit number of populated docs per parent */
  perDocumentLimit?: number
}

/**
 * Query options for population queries
 */
export interface PopulateQueryOptions {
  sort?: string | Record<string, 1 | -1>
  limit?: number
  skip?: number
  lean?: boolean
  session?: unknown
}

/**
 * Internal structure for tracking population state
 */
interface PopulationContext {
  /** Map of model name -> Map of stringified ObjectId -> fetched document */
  fetchedDocs: Map<string, Map<string, unknown>>

  /** Set of paths currently being populated (for circular reference detection) */
  populatingPaths: Set<string>

  /** The root documents being populated */
  rootDocs: unknown[]

  /** Session for transactional population */
  session?: unknown
}

/**
 * Parsed population path info
 */
interface ParsedPopulatePath {
  /** The path to populate */
  path: string

  /** The model name for this ref */
  modelName: string | null

  /** Whether this is an array of refs */
  isArray: boolean

  /** Whether this is a virtual population */
  isVirtual: boolean

  /** Local field for virtual population */
  localField: string

  /** Foreign field for virtual population */
  foreignField: string | null

  /** The full populate options */
  options: PopulateOptions
}

/**
 * Schema-like interface for extracting ref info
 */
interface SchemaLike {
  path(path: string): SchemaTypeLike | undefined
  virtuals(): Map<string, VirtualLike>
}

/**
 * Schema type interface for ref info
 */
interface SchemaTypeLike {
  _options?: {
    ref?: string
  }
  _ref?: string
  _itemType?: SchemaTypeLike
}

/**
 * Virtual type interface
 */
interface VirtualLike {
  options?: {
    ref?: string
    localField?: string
    foreignField?: string
    justOne?: boolean
  }
}

/**
 * Model registry interface for looking up models by name
 */
interface ModelRegistry {
  get(name: string): ModelLike | undefined
}

/**
 * Model-like interface for population queries
 */
interface ModelLike {
  find(filter: Record<string, unknown>, projection?: Record<string, 0 | 1>): PromiseLike<unknown[]>
  findOne?(filter: Record<string, unknown>, projection?: Record<string, 0 | 1>): PromiseLike<unknown | null>
  modelName: string
  schema?: SchemaLike
}

// ============ Model Registry ============

/**
 * Global model registry reference (will be set by the model module)
 * @internal
 */
let _modelRegistry: ModelRegistry | null = null

/**
 * Set the model registry for population lookups
 * @internal
 */
export function setModelRegistry(registry: ModelRegistry): void {
  _modelRegistry = registry
}

/**
 * Get a model by name from the registry
 * @internal
 */
function getModel(name: string): ModelLike | undefined {
  return _modelRegistry?.get(name)
}

// ============ Main Population Function ============

/**
 * Populate documents with referenced documents
 *
 * This is the main entry point for population. It handles:
 * - Single documents or arrays of documents
 * - Multiple populate paths
 * - Batch optimization (one query per ref model)
 * - Query deduplication
 *
 * @param docs - Document(s) to populate
 * @param paths - Population options (string, object, or array)
 * @param schema - Schema for resolving refs
 * @param options - Additional options
 * @returns The populated document(s)
 *
 * @example
 * ```typescript
 * // Populate a single path
 * const populated = await populate(user, 'posts', schema)
 *
 * // Populate multiple paths
 * const populated = await populate(user, ['posts', 'friends'], schema)
 *
 * // Populate with options
 * const populated = await populate(user, {
 *   path: 'posts',
 *   select: 'title content',
 *   match: { published: true },
 *   options: { sort: { createdAt: -1 }, limit: 10 }
 * }, schema)
 * ```
 */
export async function populate<T>(
  docs: T | T[],
  paths: string | string[] | PopulateOptions | PopulateOptions[],
  schema?: SchemaLike,
  options?: { session?: unknown }
): Promise<T | T[]> {
  // Handle empty input
  if (!docs || (Array.isArray(docs) && docs.length === 0)) {
    return docs
  }

  // Normalize docs to array
  const docsArray = Array.isArray(docs) ? docs : [docs]
  const isSingleDoc = !Array.isArray(docs)

  // Parse populate paths into normalized options
  const populateOptions = normalizePopulateOptions(paths)

  if (populateOptions.length === 0) {
    return docs
  }

  // Create population context
  const context: PopulationContext = {
    fetchedDocs: new Map(),
    populatingPaths: new Set(),
    rootDocs: docsArray,
    session: options?.session,
  }

  // Process each populate path
  for (const populateOpt of populateOptions) {
    // Skip if explicitly disabled
    if (populateOpt.skip === true) {
      continue
    }

    await populatePath(docsArray, populateOpt, schema, context)
  }

  // Safe assertion: we checked docs array is non-empty above, and isSingleDoc means original was a single doc
  return isSingleDoc ? (docsArray[0] as T) : docsArray
}

/**
 * Populate a single path across all documents
 */
async function populatePath(
  docs: unknown[],
  populateOpt: PopulateOptions,
  schema: SchemaLike | undefined,
  context: PopulationContext
): Promise<void> {
  const path = populateOpt.path

  // Check for circular reference
  if (context.populatingPaths.has(path)) {
    console.warn(`Circular population detected for path: ${path}`)
    return
  }

  context.populatingPaths.add(path)

  try {
    // Parse the path to get ref info
    const parsedPath = await parsePopulatePath(path, populateOpt, schema)

    if (!parsedPath.modelName && !parsedPath.isVirtual) {
      // Cannot determine model, skip
      if (populateOpt.strictPopulate) {
        throw new Error(`Cannot populate path "${path}": no ref found in schema`)
      }
      return
    }

    if (parsedPath.isVirtual) {
      // Handle virtual population (reverse lookup)
      await populateVirtual(docs, parsedPath, context)
    } else {
      // Handle normal ref population
      await populateRef(docs, parsedPath, context)
    }

    // Handle nested population
    if (populateOpt.populate) {
      const nestedOptions = normalizePopulateOptions(populateOpt.populate)
      const model = parsedPath.modelName ? getModel(parsedPath.modelName) : undefined

      for (const doc of docs) {
        const populatedValue = getNestedValue(doc, path)
        if (populatedValue) {
          const populatedDocs = Array.isArray(populatedValue) ? populatedValue : [populatedValue]

          for (const nestedOpt of nestedOptions) {
            await populatePath(populatedDocs, nestedOpt, model?.schema, context)
          }
        }
      }
    }
  } finally {
    context.populatingPaths.delete(path)
  }
}

/**
 * Populate a regular ref path (ObjectId references)
 */
async function populateRef(
  docs: unknown[],
  parsedPath: ParsedPopulatePath,
  context: PopulationContext
): Promise<void> {
  const { path, modelName, isArray, options } = parsedPath

  if (!modelName) {
    return
  }

  // Collect all ObjectIds that need to be fetched
  const idsToFetch = new Set<string>()
  const idsByDoc = new Map<unknown, (ObjectId | string)[]>()

  for (const doc of docs) {
    const value = getNestedValue(doc, path)

    if (value == null) {
      continue
    }

    const ids = isArray ? (value as (ObjectId | string)[]) : [value as ObjectId | string]
    const stringIds = ids.map((id) => stringifyId(id)).filter((id): id is string => id != null)

    idsByDoc.set(doc, ids)

    for (const id of stringIds) {
      idsToFetch.add(id)
    }
  }

  if (idsToFetch.size === 0) {
    return
  }

  // Check cache first, then fetch remaining
  const modelCache = context.fetchedDocs.get(modelName) || new Map<string, unknown>()
  context.fetchedDocs.set(modelName, modelCache)

  const uncachedIds: string[] = []
  for (const id of idsToFetch) {
    if (!modelCache.has(id)) {
      uncachedIds.push(id)
    }
  }

  // Fetch uncached documents
  if (uncachedIds.length > 0) {
    const fetchedDocs = await fetchDocuments(modelName, uncachedIds, options, context)

    for (const fetchedDoc of fetchedDocs) {
      const docId = stringifyId((fetchedDoc as { _id?: ObjectId | string })._id)
      if (docId) {
        modelCache.set(docId, fetchedDoc)
      }
    }
  }

  // Assign fetched documents back to original documents
  for (const doc of docs) {
    const ids = idsByDoc.get(doc)
    if (!ids) {
      continue
    }

    const populatedDocs: unknown[] = []

    for (const id of ids) {
      const stringId = stringifyId(id)
      if (stringId && modelCache.has(stringId)) {
        let populatedDoc = modelCache.get(stringId)

        // Apply transform if provided
        if (options.transform && populatedDoc) {
          populatedDoc = options.transform(populatedDoc)
        }

        if (populatedDoc != null) {
          populatedDocs.push(populatedDoc)
        }
      }
    }

    // Assign the populated value
    const finalValue = isArray || options.justOne === false
      ? populatedDocs
      : options.justOne === true || !isArray
        ? populatedDocs[0] ?? null
        : populatedDocs

    setNestedValue(doc, path, finalValue)

    // Track populated path for depopulation support
    if (typeof doc === 'object' && doc !== null && '$__' in doc) {
      const internal = (doc as { $__?: { populated?: Map<string, unknown> } }).$__
      if (internal?.populated) {
        internal.populated.set(path, ids.length === 1 && !isArray ? ids[0] : ids)
      }
    }
  }
}

/**
 * Populate a virtual path (reverse lookup using localField/foreignField)
 */
async function populateVirtual(
  docs: unknown[],
  parsedPath: ParsedPopulatePath,
  context: PopulationContext
): Promise<void> {
  const { path, modelName, localField, foreignField, options } = parsedPath

  if (!modelName || !foreignField) {
    return
  }

  // Collect all local field values
  const localValues = new Set<string>()
  const localValuesByDoc = new Map<unknown, string | null>()

  for (const doc of docs) {
    const localValue = getNestedValue(doc, localField)
    const stringValue = stringifyId(localValue as ObjectId | string | undefined)

    localValuesByDoc.set(doc, stringValue)

    if (stringValue) {
      localValues.add(stringValue)
    }
  }

  if (localValues.size === 0) {
    return
  }

  // Build the query filter
  const queryFilter: Record<string, unknown> = {
    [foreignField]: { $in: Array.from(localValues) },
  }

  // Merge with match filter if provided
  if (options.match) {
    Object.assign(queryFilter, options.match)
  }

  // Fetch matching documents
  const fetchedDocs = await fetchDocuments(modelName, null, options, context, queryFilter)

  // Group fetched docs by their foreign field value
  const docsByForeignValue = new Map<string, unknown[]>()

  for (const fetchedDoc of fetchedDocs) {
    const foreignValue = getNestedValue(fetchedDoc, foreignField)
    const stringValue = stringifyId(foreignValue as ObjectId | string | undefined)

    if (stringValue) {
      if (!docsByForeignValue.has(stringValue)) {
        docsByForeignValue.set(stringValue, [])
      }
      docsByForeignValue.get(stringValue)!.push(fetchedDoc)
    }
  }

  // Assign to parent documents
  for (const doc of docs) {
    const localValue = localValuesByDoc.get(doc)

    if (localValue) {
      let matchedDocs = docsByForeignValue.get(localValue) || []

      // Apply transform if provided
      if (options.transform) {
        matchedDocs = matchedDocs.map(options.transform)
      }

      // Apply perDocumentLimit
      if (options.perDocumentLimit && matchedDocs.length > options.perDocumentLimit) {
        matchedDocs = matchedDocs.slice(0, options.perDocumentLimit)
      }

      // Determine final value (single or array)
      const justOne = options.justOne
      const finalValue = justOne ? (matchedDocs[0] ?? null) : matchedDocs

      setNestedValue(doc, path, finalValue)
    }
  }
}

// ============ Helper Functions ============

/**
 * Normalize populate options to an array of PopulateOptions
 */
function normalizePopulateOptions(
  paths: string | string[] | PopulateOptions | PopulateOptions[]
): PopulateOptions[] {
  if (typeof paths === 'string') {
    // Handle space-separated paths: 'posts friends' -> ['posts', 'friends']
    return paths.split(/\s+/).filter(Boolean).map((p) => ({ path: p }))
  }

  if (Array.isArray(paths)) {
    return paths.flatMap((p) => normalizePopulateOptions(p))
  }

  return [paths]
}

/**
 * Parse a populate path and extract ref/model information
 */
async function parsePopulatePath(
  path: string,
  options: PopulateOptions,
  schema: SchemaLike | undefined
): Promise<ParsedPopulatePath> {
  // Default result
  const result: ParsedPopulatePath = {
    path,
    modelName: options.model || null,
    isArray: false,
    isVirtual: false,
    localField: options.localField || path,
    foreignField: options.foreignField || null,
    options,
  }

  // Check if this is a virtual populate
  if (options.localField && options.foreignField) {
    result.isVirtual = true
    result.localField = options.localField
    result.foreignField = options.foreignField
    return result
  }

  if (!schema) {
    return result
  }

  // Check for virtual with populate options
  const virtuals = schema.virtuals()
  const virtual = virtuals.get(path)

  if (virtual?.options) {
    const { ref, localField, foreignField, justOne } = virtual.options

    if (foreignField) {
      result.isVirtual = true
      result.modelName = options.model || ref || null
      result.localField = localField || '_id'
      result.foreignField = foreignField
      result.options = { ...options, justOne: options.justOne ?? justOne }
      return result
    }
  }

  // Get ref from schema path
  const schemaPath = schema.path(path)

  if (schemaPath) {
    // Check for direct ref
    const ref = schemaPath._options?.ref || schemaPath._ref

    if (ref) {
      result.modelName = options.model || ref
      return result
    }

    // Check for array of refs
    if (schemaPath._itemType) {
      const itemRef = schemaPath._itemType._options?.ref || schemaPath._itemType._ref

      if (itemRef) {
        result.modelName = options.model || itemRef
        result.isArray = true
        return result
      }
    }
  }

  return result
}

/**
 * Fetch documents from a model by IDs or custom filter
 *
 * TODO: Use capnweb's map() pattern for batch optimization
 * This would allow batching multiple population queries across different
 * models into a single database round-trip when possible.
 */
async function fetchDocuments(
  modelName: string,
  ids: string[] | null,
  options: PopulateOptions,
  context: PopulationContext,
  customFilter?: Record<string, unknown>
): Promise<unknown[]> {
  const model = getModel(modelName)

  if (!model) {
    if (options.strictPopulate) {
      throw new Error(`Model "${modelName}" not found for population`)
    }
    return []
  }

  // Build filter
  const filter: Record<string, unknown> = customFilter || {}

  if (ids !== null) {
    // Note: In real implementation, we'd convert string IDs back to ObjectIds
    // For now, we query with string IDs since mondodb should handle both
    filter._id = { $in: ids }
  }

  // Merge with match filter
  if (options.match && !customFilter) {
    Object.assign(filter, options.match)
  }

  // Build projection from select
  const projection = parseSelectToProjection(options.select)

  // Execute query
  // TODO: Apply options.options (sort, limit, skip) when collection supports it
  // TODO: Pass context.session to the query
  try {
    const results = await model.find(filter, projection)
    return results
  } catch (error) {
    console.error(`Error populating from model "${modelName}":`, error)
    return []
  }
}

/**
 * Parse select option to projection object
 */
function parseSelectToProjection(
  select: PopulateOptions['select']
): Record<string, 0 | 1> | undefined {
  if (!select) {
    return undefined
  }

  if (typeof select === 'string') {
    const projection: Record<string, 0 | 1> = {}
    const fields = select.split(/\s+/)

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

  if (Array.isArray(select)) {
    const projection: Record<string, 0 | 1> = {}

    for (const field of select) {
      if (field.startsWith('-')) {
        projection[field.slice(1)] = 0
      } else {
        projection[field] = 1
      }
    }

    return projection
  }

  return select
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (obj == null) {
    return undefined
  }

  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current == null) {
      return undefined
    }

    // Handle _doc for Mongoose.do documents
    if (typeof current === 'object' && '_doc' in current) {
      current = (current as { _doc: unknown })._doc
    }

    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * Set a nested value on an object using dot notation
 */
function setNestedValue(obj: unknown, path: string, value: unknown): void {
  if (obj == null) {
    return
  }

  const parts = path.split('.')

  // Handle _doc for Mongoose.do documents
  let target: unknown = obj
  if (typeof target === 'object' && target !== null && '_doc' in target) {
    target = (target as { _doc: unknown })._doc
  }

  // Navigate to parent of target path
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!part) continue

    if (typeof target !== 'object' || target === null) {
      return
    }

    let next: unknown = (target as Record<string, unknown>)[part]

    if (next == null) {
      next = {}
      ;(target as Record<string, unknown>)[part] = next
    }

    target = next
  }

  // Set the final value
  const lastPart = parts[parts.length - 1]
  if (lastPart && typeof target === 'object' && target !== null) {
    ;(target as Record<string, unknown>)[lastPart] = value
  }
}

/**
 * Convert an ObjectId or string to a consistent string representation
 */
function stringifyId(id: ObjectId | string | unknown): string | null {
  if (id == null) {
    return null
  }

  if (typeof id === 'string') {
    return id
  }

  // Handle ObjectId with toString method
  if (typeof id === 'object' && 'toString' in id && typeof id.toString === 'function') {
    return id.toString()
  }

  // Handle ObjectId with toHexString method
  if (typeof id === 'object' && 'toHexString' in id && typeof (id as { toHexString: () => string }).toHexString === 'function') {
    return (id as { toHexString: () => string }).toHexString()
  }

  return String(id)
}

// ============ Additional Helper Functions ============

/**
 * Collect all paths that need to be populated from a schema and options
 *
 * This helper parses populate options and resolves them against a schema
 * to get the full list of paths and their configurations.
 *
 * @param schema - The schema to check for refs
 * @param options - The populate options
 * @returns Array of parsed populate paths
 */
export function collectPopulatePaths(
  schema: SchemaLike | undefined,
  options: string | string[] | PopulateOptions | PopulateOptions[]
): ParsedPopulatePath[] {
  const normalizedOptions = normalizePopulateOptions(options)
  const paths: ParsedPopulatePath[] = []

  for (const opt of normalizedOptions) {
    // This is async in the main function but we make it sync here for collection
    // The actual model resolution happens during population
    paths.push({
      path: opt.path,
      modelName: opt.model || null,
      isArray: false,
      isVirtual: !!(opt.localField && opt.foreignField),
      localField: opt.localField || opt.path,
      foreignField: opt.foreignField || null,
      options: opt,
    })
  }

  return paths
}

/**
 * Resolve the referenced model name for a schema path
 *
 * @param schema - The schema to check
 * @param path - The path to check for ref
 * @returns The model name or null if not found
 */
export function resolveRefModel(
  schema: SchemaLike | undefined,
  path: string
): string | null {
  if (!schema) {
    return null
  }

  // Check virtuals first
  const virtuals = schema.virtuals()
  const virtual = virtuals.get(path)

  if (virtual?.options?.ref) {
    return virtual.options.ref
  }

  // Check schema path
  const schemaPath = schema.path(path)

  if (!schemaPath) {
    return null
  }

  // Direct ref
  const ref = schemaPath._options?.ref || schemaPath._ref
  if (ref) {
    return ref
  }

  // Array of refs
  if (schemaPath._itemType) {
    const itemRef = schemaPath._itemType._options?.ref || schemaPath._itemType._ref
    if (itemRef) {
      return itemRef
    }
  }

  return null
}

/**
 * Assign populated documents back to the parent documents
 *
 * This is a helper for manual population assignment when you have
 * already fetched the documents separately.
 *
 * @param docs - The parent documents to assign to
 * @param path - The path to assign at
 * @param fetchedDocs - Map of ID -> fetched document
 * @param options - Population options
 */
export function assignPopulated(
  docs: unknown[],
  path: string,
  fetchedDocs: Map<string, unknown>,
  options?: { isArray?: boolean; justOne?: boolean }
): void {
  const isArray = options?.isArray ?? false
  const justOne = options?.justOne

  for (const doc of docs) {
    const value = getNestedValue(doc, path)

    if (value == null) {
      continue
    }

    const ids = isArray ? (value as unknown[]) : [value]
    const populatedDocs: unknown[] = []

    for (const id of ids) {
      const stringId = stringifyId(id)

      if (stringId && fetchedDocs.has(stringId)) {
        populatedDocs.push(fetchedDocs.get(stringId))
      }
    }

    // Determine final value
    const finalValue = isArray || justOne === false
      ? populatedDocs
      : justOne === true || !isArray
        ? populatedDocs[0] ?? null
        : populatedDocs

    setNestedValue(doc, path, finalValue)
  }
}

/**
 * Depopulate a path on documents - restore original ObjectId values
 *
 * @param docs - Documents to depopulate
 * @param path - Path to depopulate (or all if not specified)
 */
export function depopulate(
  docs: unknown | unknown[],
  path?: string
): void {
  const docsArray = Array.isArray(docs) ? docs : [docs]

  for (const doc of docsArray) {
    if (typeof doc !== 'object' || doc === null) {
      continue
    }

    // Check if document has internal state with populated tracking
    if ('$__' in doc) {
      const internal = (doc as { $__?: { populated?: Map<string, unknown> } }).$__

      if (internal?.populated) {
        if (path) {
          // Depopulate specific path
          const originalId = internal.populated.get(path)

          if (originalId !== undefined) {
            setNestedValue(doc, path, originalId)
            internal.populated.delete(path)
          }
        } else {
          // Depopulate all paths
          for (const [p, originalId] of internal.populated) {
            setNestedValue(doc, p, originalId)
          }
          internal.populated.clear()
        }
      }
    }
  }
}

/**
 * Check if a path on a document is currently populated
 *
 * @param doc - Document to check
 * @param path - Path to check
 * @returns true if the path is populated with a document/documents
 */
export function isPopulated(doc: unknown, path: string): boolean {
  if (typeof doc !== 'object' || doc === null) {
    return false
  }

  // Check internal populated tracking
  if ('$__' in doc) {
    const internal = (doc as { $__?: { populated?: Map<string, unknown> } }).$__

    if (internal?.populated?.has(path)) {
      return true
    }
  }

  // Heuristic: check if the value is an object (not just an ID)
  const value = getNestedValue(doc, path)

  if (value == null) {
    return false
  }

  // If it's an array, check if elements are objects
  if (Array.isArray(value)) {
    return value.length > 0 && typeof value[0] === 'object' && value[0] !== null
  }

  // Check if it's an object (populated) vs a string/ObjectId (not populated)
  return typeof value === 'object' && !isObjectId(value)
}

/**
 * Check if a value looks like an ObjectId
 */
function isObjectId(value: unknown): boolean {
  if (typeof value === 'string') {
    // Check if it looks like a hex ObjectId
    return /^[0-9a-fA-F]{24}$/.test(value)
  }

  if (typeof value === 'object' && value !== null) {
    // Check for ObjectId-like objects
    return 'toHexString' in value || '_bsontype' in value
  }

  return false
}

// ============ Exports ============

export type { ParsedPopulatePath, PopulationContext, SchemaLike, ModelLike, ModelRegistry }
