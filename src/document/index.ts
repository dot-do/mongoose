/**
 * Document class - represents a single MongoDB document with change tracking
 */

import type { ObjectId } from '../types/index.js'
import { Schema, type ValidationError, MongooseValidationError } from '../schema/index.js'

// ============ Internal State Interface ============

/**
 * Internal document state for tracking changes and metadata
 */
export interface DocumentInternal {
  /** Set of paths that have been modified */
  modifiedPaths: Set<string>
  /** Whether this is a new document (not yet saved) */
  isNew: boolean
  /** Original values before modification (for dirty checking) */
  originalValues: Map<string, unknown>
  /** Paths that have been populated with referenced documents */
  populated: Map<string, ObjectId | ObjectId[]>
  /** Transaction session */
  session: unknown | null
  /** Whether the document has been deleted */
  wasDeleted: boolean
  /** Validation errors */
  validationError: MongooseValidationError | null
  /** Paths that were explicitly marked as modified */
  directModifiedPaths: Set<string>
  /** The schema for this document */
  schema: Schema<any> | null
  /** Reference to the Model (will be set by Model class) */
  model: any | null
  /** Version key value */
  version: number
  /** Paths to select (projection) */
  selected?: Record<string, 0 | 1>
  /** Whether strict mode is enabled */
  strictMode: boolean | 'throw'
}

// ============ ToObject Options ============

export interface ToObjectOptions {
  /** Include getters in output */
  getters?: boolean
  /** Include virtuals in output */
  virtuals?: boolean
  /** Include version key */
  versionKey?: boolean
  /** Transform function */
  transform?: (doc: Document<any>, ret: Record<string, unknown>, options: ToObjectOptions) => Record<string, unknown>
  /** Depopulate refs */
  depopulate?: boolean
  /** Minimize output (remove empty objects) */
  minimize?: boolean
  /** Flatten maps to plain objects */
  flattenMaps?: boolean
  /** Use aliases */
  aliases?: boolean
}

// ============ Document Class ============

/**
 * Document class with Proxy-based change tracking
 */
export class Document<T extends Record<string, unknown> = Record<string, unknown>> {
  /** Internal document data storage */
  _doc: T

  /** Internal state object */
  $__: DocumentInternal

  /** Whether this document is new (not yet saved to database) */
  get isNew(): boolean {
    return this.$__.isNew
  }

  set isNew(value: boolean) {
    this.$__.isNew = value
  }

  /** Whether this document has been deleted */
  $isDeleted: boolean = false

  /** The document's _id */
  get _id(): ObjectId | undefined {
    return (this._doc as any)._id
  }

  set _id(value: ObjectId | undefined) {
    (this._doc as any)._id = value
  }

  /** The document's id as a string */
  get id(): string | undefined {
    const _id = this._id
    return _id ? String(_id) : undefined
  }

  /**
   * Create a new Document instance
   */
  constructor(doc: Partial<T> = {}, schema?: Schema<T>, isNew: boolean = true) {
    // Initialize internal state
    this.$__ = {
      modifiedPaths: new Set(),
      isNew,
      originalValues: new Map(),
      populated: new Map(),
      session: null,
      wasDeleted: false,
      validationError: null,
      directModifiedPaths: new Set(),
      schema: schema || null,
      model: null,
      version: 0,
      strictMode: schema?.get('strict') ?? true,
    }

    // Initialize document data
    this._doc = {} as T

    // Apply schema defaults and set initial values
    if (schema) {
      const casted = schema.cast(doc as Record<string, unknown>)
      this._doc = casted as T
    } else {
      this._doc = { ...doc } as T
    }

    // Return a Proxy for change tracking
    return this._createProxy()
  }

  /**
   * Create a Proxy wrapper for change tracking
   */
  private _createProxy(): this {
    const self = this

    return new Proxy(this, {
      get(target, prop: string | symbol, receiver) {
        // Handle symbol properties and internal properties
        if (typeof prop === 'symbol') {
          return Reflect.get(target, prop, receiver)
        }

        // Handle special properties
        if (prop === '_doc' || prop === '$__' || prop === '$isDeleted' || prop === 'isNew') {
          return Reflect.get(target, prop, receiver)
        }

        // Handle methods - bind to receiver (proxy) so `this` works correctly
        if (typeof (target as any)[prop] === 'function') {
          return (target as any)[prop].bind(receiver)
        }

        // Handle getters
        if (prop === 'id' || prop === '_id') {
          return Reflect.get(target, prop, receiver)
        }

        // Get from _doc
        if (prop in target._doc) {
          return (target._doc as any)[prop]
        }

        // Check virtuals
        if (target.$__.schema) {
          const virtuals = target.$__.schema.virtuals()
          const virtual = virtuals.get(prop)
          if (virtual?.get) {
            // Use receiver (the proxy) so the getter can access properties through proxy
            return virtual.get.call(receiver)
          }
        }

        return Reflect.get(target, prop, receiver)
      },

      set(target, prop: string | symbol, value, receiver) {
        // Handle symbol properties
        if (typeof prop === 'symbol') {
          return Reflect.set(target, prop, value, receiver)
        }

        // Handle internal properties directly
        if (prop === '_doc' || prop === '$__' || prop === '$isDeleted' || prop === 'isNew') {
          return Reflect.set(target, prop, value, receiver)
        }

        // Handle _id specially
        if (prop === '_id') {
          (target._doc as any)._id = value
          target.$__.modifiedPaths.add('_id')
          target.$__.directModifiedPaths.add('_id')
          return true
        }

        // Check virtuals for setters
        if (target.$__.schema) {
          const virtuals = target.$__.schema.virtuals()
          const virtual = virtuals.get(prop)
          if (virtual?.set) {
            virtual.set.call(target, value)
            return true
          }
        }

        // Store original value if not already tracked
        if (!target.$__.originalValues.has(prop)) {
          target.$__.originalValues.set(prop, (target._doc as any)[prop])
        }

        // Set the value
        (target._doc as any)[prop] = value

        // Track modification
        target.$__.modifiedPaths.add(prop)
        target.$__.directModifiedPaths.add(prop)

        return true
      },

      has(target, prop: string | symbol) {
        if (typeof prop === 'symbol') {
          return Reflect.has(target, prop)
        }
        return prop in target._doc || Reflect.has(target, prop)
      },

      ownKeys(target) {
        const docKeys = Object.keys(target._doc)
        const instanceKeys = ['_doc', '$__', '$isDeleted', 'isNew', 'id', '_id']
        return [...new Set([...docKeys, ...instanceKeys])]
      },

      getOwnPropertyDescriptor(target, prop) {
        if (typeof prop === 'string' && prop in target._doc) {
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: (target._doc as any)[prop],
          }
        }
        return Reflect.getOwnPropertyDescriptor(target, prop)
      },
    })
  }

  // ============ Change Tracking Methods ============

  /**
   * Mark a path as modified
   */
  markModified(path: string): this {
    this.$__.modifiedPaths.add(path)
    this.$__.directModifiedPaths.add(path)
    return this
  }

  /**
   * Check if a path (or any path if not specified) has been modified
   */
  isModified(path?: string | string[]): boolean {
    if (!path) {
      return this.$__.modifiedPaths.size > 0
    }

    if (Array.isArray(path)) {
      return path.some((p) => this.$__.modifiedPaths.has(p))
    }

    // Check direct path
    if (this.$__.modifiedPaths.has(path)) {
      return true
    }

    // Check parent paths (e.g., 'address.city' is modified if 'address' is modified)
    for (const modPath of this.$__.modifiedPaths) {
      if (modPath.startsWith(path + '.') || path.startsWith(modPath + '.')) {
        return true
      }
    }

    return false
  }

  /**
   * Get all modified paths
   */
  modifiedPaths(options?: { includeChildren?: boolean }): string[] {
    const paths = Array.from(this.$__.modifiedPaths)

    if (options?.includeChildren) {
      // Include nested paths for modified objects
      const allPaths: string[] = []
      for (const path of paths) {
        allPaths.push(path)
        const value = this.get(path)
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const nested = this._getNestedPaths(value as Record<string, unknown>, path)
          allPaths.push(...nested)
        }
      }
      return [...new Set(allPaths)]
    }

    return paths
  }

  /**
   * Get paths that were directly modified (not parent paths)
   */
  directModifiedPaths(): string[] {
    return Array.from(this.$__.directModifiedPaths)
  }

  /**
   * Helper to get nested paths from an object
   */
  private _getNestedPaths(obj: Record<string, unknown>, prefix: string): string[] {
    const paths: string[] = []
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = `${prefix}.${key}`
      paths.push(fullPath)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        paths.push(...this._getNestedPaths(value as Record<string, unknown>, fullPath))
      }
    }
    return paths
  }

  /**
   * Unmark a path as modified
   */
  unmarkModified(path: string): this {
    this.$__.modifiedPaths.delete(path)
    this.$__.directModifiedPaths.delete(path)
    return this
  }

  /**
   * Check if document is selected for a path
   */
  isSelected(path: string): boolean {
    if (!this.$__.selected) return true
    return this.$__.selected[path] === 1
  }

  /**
   * Check if document is initialized
   */
  isInit(path: string): boolean {
    return path in this._doc
  }

  // ============ Core Methods ============

  /**
   * Save the document to the database
   * Note: This is a placeholder - actual implementation will be in Model
   */
  async save(options?: { validateBeforeSave?: boolean; session?: unknown }): Promise<this> {
    // Run validation before save (unless explicitly disabled)
    if (options?.validateBeforeSave !== false) {
      await this.validate()
    }

    // Set session if provided
    if (options?.session) {
      this.$__.session = options.session
    }

    // If model reference is available, delegate to model
    if (this.$__.model) {
      return this.$__.model._saveDocument(this, options)
    }

    // Placeholder: In real implementation, this would call the Model's save method
    // For now, just mark as no longer new and clear modified paths
    this.$__.isNew = false
    this.$__.modifiedPaths.clear()
    this.$__.directModifiedPaths.clear()
    this.$__.originalValues.clear()

    return this
  }

  /**
   * Run schema validators on this document
   */
  async validate(pathsToValidate?: string[]): Promise<void> {
    if (!this.$__.schema) {
      return // No schema, skip validation
    }

    const { valid, errors } = await this.$__.schema.validate(this._doc)

    if (!valid) {
      const validationError = new MongooseValidationError('Validation failed')

      for (const error of errors) {
        // If specific paths requested, only include those errors
        if (pathsToValidate && !pathsToValidate.includes(error.path)) {
          continue
        }
        validationError.addError(error.path, error)
      }

      if (validationError.errors.size > 0) {
        this.$__.validationError = validationError
        throw validationError
      }
    }

    this.$__.validationError = null
  }

  /**
   * Validate a specific path synchronously
   * Note: This is named for Mongoose compatibility but may not support async validators
   */
  validateSync(paths?: string[]): ValidationError[] | null {
    // Note: This is a sync-named method but validation may be async
    // For true sync validation, we'd need sync validators only
    return null // Placeholder
  }

  /**
   * Get the validation error for this document
   */
  get errors(): Map<string, ValidationError> | undefined {
    return this.$__.validationError?.errors
  }

  /**
   * Convert document to a plain JavaScript object
   */
  toObject(options?: ToObjectOptions): Record<string, unknown> {
    const schemaOpts = this.$__.schema?.get('toObject') as ToObjectOptions | undefined
    const opts: ToObjectOptions = {
      ...schemaOpts,
      ...options,
    }

    let obj: Record<string, unknown> = { ...this._doc }

    // Apply virtuals if requested
    if (opts.virtuals && this.$__.schema) {
      const virtuals = this.$__.schema.virtuals()
      for (const [name, virtual] of virtuals) {
        if (virtual.get) {
          obj[name] = virtual.get.call(this)
        }
      }
    }

    // Depopulate if requested
    if (opts.depopulate) {
      for (const [path, originalId] of this.$__.populated) {
        this._setNestedValue(obj, path, originalId)
      }
    }

    // Remove version key if requested
    if (opts.versionKey === false) {
      delete obj.__v
    }

    // Minimize (remove empty objects)
    if (opts.minimize) {
      obj = this._minimize(obj)
    }

    // Flatten maps
    if (opts.flattenMaps) {
      obj = this._flattenMaps(obj)
    }

    // Apply transform
    if (opts.transform) {
      obj = opts.transform(this, obj, opts)
    }

    return obj
  }

  /**
   * Convert document to JSON
   */
  toJSON(options?: ToObjectOptions): Record<string, unknown> {
    const schemaOpts = this.$__.schema?.get('toJSON') as ToObjectOptions | undefined
    const opts: ToObjectOptions = {
      ...schemaOpts,
      ...options,
    }

    return this.toObject(opts)
  }

  /**
   * Helper to minimize an object (remove empty nested objects)
   */
  private _minimize(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        const minimized = this._minimize(value as Record<string, unknown>)
        if (Object.keys(minimized).length > 0) {
          result[key] = minimized
        }
      } else if (value !== undefined) {
        result[key] = value
      }
    }

    return result
  }

  /**
   * Helper to flatten Maps to plain objects
   */
  private _flattenMaps(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(obj)) {
      if (value instanceof Map) {
        result[key] = Object.fromEntries(value)
      } else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key] = this._flattenMaps(value as Record<string, unknown>)
      } else {
        result[key] = value
      }
    }

    return result
  }

  /**
   * Get a value by path (supports dot notation)
   */
  get(path: string, type?: any): unknown {
    const parts = path.split('.')
    let current: unknown = this._doc

    for (const part of parts) {
      if (current == null) return undefined
      current = (current as Record<string, unknown>)[part]
    }

    // Check virtuals if value not found
    if (current === undefined && this.$__.schema) {
      const virtuals = this.$__.schema.virtuals()
      const virtual = virtuals.get(path)
      if (virtual?.get) {
        return virtual.get.call(this)
      }
    }

    return current
  }

  /**
   * Set a value by path (supports dot notation) with change tracking
   */
  set(path: string | Record<string, unknown>, val?: unknown): this {
    // Handle object form: doc.set({ name: 'John', age: 30 })
    if (typeof path === 'object') {
      for (const [key, value] of Object.entries(path)) {
        this.set(key, value)
      }
      return this
    }

    // Store original value if not already tracked
    if (!this.$__.originalValues.has(path)) {
      this.$__.originalValues.set(path, this.get(path))
    }

    // Set the value
    const parts = path.split('.')

    if (parts.length === 1) {
      // Simple path
      (this._doc as any)[path] = val
    } else {
      // Nested path
      this._setNestedValue(this._doc, path, val)
    }

    // Track modification
    this.$__.modifiedPaths.add(path)
    this.$__.directModifiedPaths.add(path)

    // Also mark parent paths as modified
    let parentPath = ''
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (part !== undefined) {
        parentPath = parentPath ? `${parentPath}.${part}` : part
        this.$__.modifiedPaths.add(parentPath)
      }
    }

    return this
  }

  /**
   * Helper to set a nested value by path
   */
  private _setNestedValue(obj: unknown, path: string, value: unknown): void {
    const parts = path.split('.')
    let current = obj as Record<string, unknown>

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (part === undefined) continue
      if (!(part in current) || current[part] == null) {
        current[part] = {}
      }
      current = current[part] as Record<string, unknown>
    }

    const lastPart = parts[parts.length - 1]
    if (lastPart !== undefined) {
      current[lastPart] = value
    }
  }

  // ============ Population Support ============

  /**
   * Populate referenced documents
   * Note: This is a placeholder - actual implementation requires Model
   */
  async populate(path: string | string[] | Record<string, any>): Promise<this> {
    // Placeholder: In real implementation, this would:
    // 1. Look up the ref in schema
    // 2. Query the referenced model
    // 3. Replace the ObjectId with the populated document
    // 4. Track the original ObjectId in populated map

    if (this.$__.model) {
      return this.$__.model._populateDocument(this, path)
    }

    console.warn('Document.populate() called without Model reference')
    return this
  }

  /**
   * Get the original ObjectId for a populated path
   */
  populated(path: string): ObjectId | ObjectId[] | undefined {
    return this.$__.populated.get(path)
  }

  /**
   * Restore the original ObjectId for a populated path
   */
  depopulate(path?: string): this {
    if (path) {
      const originalId = this.$__.populated.get(path)
      if (originalId !== undefined) {
        this._setNestedValue(this._doc, path, originalId)
        this.$__.populated.delete(path)
      }
    } else {
      // Depopulate all paths
      for (const [p, originalId] of this.$__.populated) {
        this._setNestedValue(this._doc, p, originalId)
      }
      this.$__.populated.clear()
    }

    return this
  }

  /**
   * Mark a path as populated with the original ObjectId
   * @internal
   */
  _markPopulated(path: string, originalId: ObjectId | ObjectId[]): void {
    this.$__.populated.set(path, originalId)
  }

  // ============ Session Support ============

  /**
   * Get or set the transaction session
   */
  $session(): unknown | null
  $session(session: unknown | null): this
  $session(session?: unknown | null): unknown | null | this {
    if (session === undefined) {
      return this.$__.session
    }
    this.$__.session = session
    return this
  }

  // ============ Utility Methods ============

  /**
   * Get a specific field's value (alias for get)
   */
  $get(path: string): unknown {
    return this.get(path)
  }

  /**
   * Set a specific field's value (alias for set)
   */
  $set(path: string | Record<string, unknown>, val?: unknown): this {
    return this.set(path, val)
  }

  /**
   * Check if a path exists in the document
   */
  $has(path: string): boolean {
    return this.get(path) !== undefined
  }

  /**
   * Delete a path from the document
   */
  $unset(path: string | string[]): this {
    const paths = Array.isArray(path) ? path : [path]

    for (const p of paths) {
      this.set(p, undefined)
    }

    return this
  }

  /**
   * Increment a numeric field
   */
  $inc(path: string, val: number = 1): this {
    const current = this.get(path)
    const newVal = (typeof current === 'number' ? current : 0) + val
    return this.set(path, newVal)
  }

  /**
   * Check equality with another document or object
   */
  equals(doc: Document<T> | Record<string, unknown>): boolean {
    if (doc instanceof Document) {
      return this._id !== undefined &&
             doc._id !== undefined &&
             String(this._id) === String(doc._id)
    }
    return this._id !== undefined &&
           (doc as any)._id !== undefined &&
           String(this._id) === String((doc as any)._id)
  }

  /**
   * Get the document's schema
   */
  get schema(): Schema<T> | null {
    return this.$__.schema as Schema<T> | null
  }

  /**
   * Get the document's model name
   */
  get modelName(): string | undefined {
    return this.$__.model?.modelName
  }

  /**
   * Get the collection for this document
   */
  get collection(): unknown | undefined {
    return this.$__.model?.collection
  }

  /**
   * Get the database for this document
   */
  get db(): unknown | undefined {
    return this.$__.model?.db
  }

  /**
   * Override for Array.isArray checks
   */
  get [Symbol.toStringTag](): string {
    return 'Document'
  }

  /**
   * Create a copy of this document
   */
  $clone(): Document<T> {
    const cloned = new Document<T>(
      JSON.parse(JSON.stringify(this._doc)),
      this.$__.schema as Schema<T>,
      this.$__.isNew
    )
    cloned.$__.model = this.$__.model
    return cloned
  }

  /**
   * Reset all modifications
   */
  $reset(): this {
    // Restore original values
    for (const [path, originalValue] of this.$__.originalValues) {
      this._setNestedValue(this._doc, path, originalValue)
    }

    // Clear tracking
    this.$__.modifiedPaths.clear()
    this.$__.directModifiedPaths.clear()
    this.$__.originalValues.clear()

    return this
  }

  /**
   * Mark document as deleted
   */
  $markDeleted(val: boolean = true): void {
    this.$isDeleted = val
    this.$__.wasDeleted = val
  }

  /**
   * Check if document was deleted
   */
  $wasDeleted(): boolean {
    return this.$__.wasDeleted
  }

  /**
   * Get parent document (for subdocuments)
   */
  parent(): Document<any> | undefined {
    return undefined // Override in subdocument implementation
  }

  /**
   * Get root document (for nested subdocuments)
   */
  $root(): Document<any> {
    return this
  }

  /**
   * Remove this document from the database
   * Note: Placeholder - actual implementation in Model
   */
  async deleteOne(options?: { session?: unknown }): Promise<this> {
    if (options?.session) {
      this.$__.session = options.session
    }

    if (this.$__.model) {
      return this.$__.model._deleteDocument(this, options)
    }

    this.$markDeleted()
    return this
  }

  /**
   * Alias for deleteOne
   */
  async remove(options?: { session?: unknown }): Promise<this> {
    return this.deleteOne(options)
  }

  /**
   * Update this document
   * Note: Placeholder - actual implementation in Model
   */
  async updateOne(
    update: Record<string, unknown>,
    options?: { session?: unknown }
  ): Promise<unknown> {
    if (this.$__.model) {
      return this.$__.model.updateOne({ _id: this._id }, update, {
        ...options,
        session: options?.session || this.$__.session,
      })
    }

    // Apply update locally
    for (const [key, value] of Object.entries(update)) {
      if (key.startsWith('$')) {
        // Handle update operators
        // Placeholder: Real implementation would handle $set, $unset, etc.
      } else {
        this.set(key, value)
      }
    }

    return { acknowledged: true, modifiedCount: 1 }
  }

  /**
   * Overwrite this document's data
   */
  overwrite(obj: Partial<T>): this {
    // Clear existing data (except _id)
    const _id = this._id
    this._doc = {} as T

    if (_id !== undefined) {
      (this._doc as any)._id = _id
    }

    // Set new data
    for (const [key, value] of Object.entries(obj)) {
      if (key !== '_id') {
        (this._doc as any)[key] = value
        this.$__.modifiedPaths.add(key)
        this.$__.directModifiedPaths.add(key)
      }
    }

    return this
  }

  /**
   * Replaces current document with another
   */
  $replaceWith(replacement: Partial<T>): this {
    return this.overwrite(replacement)
  }

  /**
   * Inspect for console logging
   */
  inspect(): Record<string, unknown> {
    return this.toObject()
  }

  /**
   * For JSON.stringify
   */
  [Symbol.for('nodejs.util.inspect.custom')](): Record<string, unknown> {
    return this.toObject()
  }
}

// ============ Export Types ============

export type { ValidationError }
