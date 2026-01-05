/**
 * Schema class - supports both Mongoose-style and $-style definitions
 */

import {
  SchemaType,
  StringType,
  NumberType,
  BooleanType,
  DateType,
  ObjectIdType,
  ArrayType,
  ObjectType,
  MixedType,
  EnumType,
  BigIntType,
  type SchemaTypeOptions,
  type InferObject,
} from '../types/index.js'

// ============ Mongoose-style Type Constructors ============

export const Types = {
  String: String,
  Number: Number,
  Boolean: Boolean,
  Date: Date,
  ObjectId: 'ObjectId' as const,
  Buffer: 'Buffer' as const,
  Mixed: 'Mixed' as const,
  Array: Array,
  Map: Map,
  BigInt: BigInt,
}

// ============ Schema Definition Types ============

export type MongooseFieldDef =
  | typeof String
  | typeof Number
  | typeof Boolean
  | typeof Date
  | 'ObjectId'
  | 'Buffer'
  | 'Mixed'
  | typeof BigInt
  | MongooseFieldDefObject
  | [MongooseFieldDef]
  | SchemaType<any, any>

export interface MongooseFieldDefObject {
  type?: MongooseFieldDef
  required?: boolean
  default?: unknown
  validate?: ((value: any) => boolean | Promise<boolean>) | RegExp
  enum?: readonly string[]
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  match?: RegExp
  ref?: string
  index?: boolean
  unique?: boolean
  sparse?: boolean
  select?: boolean
  immutable?: boolean
  transform?: (value: any) => any
}

export type SchemaDefinition = Record<string, MongooseFieldDef>

// ============ Schema Options ============

export interface SchemaOptions {
  timestamps?: boolean | { createdAt?: string | boolean; updatedAt?: string | boolean }
  versionKey?: boolean | string
  strict?: boolean | 'throw'
  collection?: string
  discriminatorKey?: string
  autoIndex?: boolean
  minimize?: boolean
  toJSON?: { virtuals?: boolean; getters?: boolean; transform?: Function }
  toObject?: { virtuals?: boolean; getters?: boolean; transform?: Function }
  id?: boolean
  _id?: boolean
}

// ============ Middleware Types ============

export type HookType =
  | 'validate'
  | 'save'
  | 'remove'
  | 'deleteOne'
  | 'updateOne'
  | 'init'
  | 'find'
  | 'findOne'
  | 'findOneAndUpdate'
  | 'findOneAndDelete'
  | 'findOneAndReplace'
  | 'updateMany'
  | 'deleteMany'
  | 'aggregate'
  | 'insertMany'

export type PreHookFn<T = any> = (this: T, next: (err?: Error) => void) => void | Promise<void>
export type PostHookFn<T = any, R = any> = (this: T, doc: R, next: (err?: Error) => void) => void | Promise<void>

interface MiddlewareEntry {
  fn: Function
  options?: { document?: boolean; query?: boolean }
}

// ============ Virtual Types ============

interface VirtualType<T = any> {
  get?: (this: T) => any
  set?: (this: T, value: any) => void
  options?: { ref?: string; localField?: string; foreignField?: string; justOne?: boolean }
}

// ============ Schema Class ============

export class Schema<T = any> {
  private _definition: SchemaDefinition
  private _options: SchemaOptions
  private _paths: Map<string, SchemaType<any, any>> = new Map()
  private _methods: Map<string, Function> = new Map()
  private _statics: Map<string, Function> = new Map()
  private _virtuals: Map<string, VirtualType> = new Map()
  private _preHooks: Map<HookType, MiddlewareEntry[]> = new Map()
  private _postHooks: Map<HookType, MiddlewareEntry[]> = new Map()
  private _indexes: Array<{ fields: Record<string, 1 | -1>; options?: Record<string, any> }> = []
  private _plugins: Array<{ fn: Function; options?: any }> = []

  /**
   * Mongoose-style constructor
   */
  constructor(definition?: SchemaDefinition, options?: SchemaOptions) {
    this._definition = definition || {}
    this._options = options || {}

    if (definition) {
      this._parseDefinition(definition)
    }

    // Add _id by default
    if (this._options._id !== false) {
      this._paths.set('_id', new ObjectIdType())
    }

    // Add timestamps if enabled
    if (this._options.timestamps) {
      const createdAt = typeof this._options.timestamps === 'object' && this._options.timestamps.createdAt
        ? (this._options.timestamps.createdAt === true ? 'createdAt' : this._options.timestamps.createdAt)
        : 'createdAt'
      const updatedAt = typeof this._options.timestamps === 'object' && this._options.timestamps.updatedAt
        ? (this._options.timestamps.updatedAt === true ? 'updatedAt' : this._options.timestamps.updatedAt)
        : 'updatedAt'

      if (createdAt) this._paths.set(createdAt, new DateType())
      if (updatedAt) this._paths.set(updatedAt, new DateType())
    }

    // Add version key if enabled
    if (this._options.versionKey !== false) {
      const versionKey = typeof this._options.versionKey === 'string' ? this._options.versionKey : '__v'
      this._paths.set(versionKey, new NumberType())
    }
  }

  /**
   * Create schema from $-style definition
   */
  static fromZodStyle<T extends Record<string, SchemaType<any, any>>>(
    shape: T,
    options?: SchemaOptions
  ): Schema<InferObject<T>> {
    const schema = new Schema<InferObject<T>>(undefined, options)

    for (const [key, type] of Object.entries(shape)) {
      schema._paths.set(key, type)
    }

    return schema
  }

  /**
   * Parse Mongoose-style definition into SchemaTypes
   */
  private _parseDefinition(definition: SchemaDefinition): void {
    for (const [key, fieldDef] of Object.entries(definition)) {
      this._paths.set(key, this._parseField(fieldDef))
    }
  }

  /**
   * Parse a single field definition
   */
  private _parseField(fieldDef: MongooseFieldDef): SchemaType<any, any> {
    // Already a SchemaType (from $ API)
    if (fieldDef instanceof SchemaType) {
      return fieldDef
    }

    // Array shorthand: [String] or [{ type: String }]
    if (Array.isArray(fieldDef)) {
      const itemType = fieldDef[0] ? this._parseField(fieldDef[0]) : new MixedType()
      return new ArrayType(itemType)
    }

    // Object with type property
    if (typeof fieldDef === 'object' && fieldDef !== null && 'type' in fieldDef) {
      const def = fieldDef as MongooseFieldDefObject
      let baseType = this._parseField(def.type!)

      // Apply options
      if (def.required) {
        baseType = baseType.required()
      }
      if (def.default !== undefined) {
        baseType = baseType.default(def.default as any)
      }
      if (def.validate) {
        if (def.validate instanceof RegExp) {
          baseType = baseType.validate((v: any) => def.validate instanceof RegExp && def.validate.test(String(v)))
        } else {
          baseType = baseType.validate(def.validate as any)
        }
      }
      if (def.index) {
        baseType = baseType.index()
      }
      if (def.unique) {
        baseType = baseType.unique()
      }
      if (def.ref && baseType instanceof ObjectIdType) {
        baseType = baseType.ref(def.ref)
      }
      if (def.enum && baseType instanceof StringType) {
        // Convert to EnumType
        return new EnumType(def.enum as readonly string[])
      }

      // String validators
      if (baseType instanceof StringType) {
        let strType = baseType as StringType
        if (def.minLength !== undefined) {
          strType = strType.min(def.minLength)
        }
        if (def.maxLength !== undefined) {
          strType = strType.max(def.maxLength)
        }
        if (def.match) {
          strType = strType.regex(def.match)
        }
        baseType = strType
      }

      // Number validators
      if (baseType instanceof NumberType) {
        let numType = baseType as NumberType
        if (def.min !== undefined) {
          numType = numType.min(def.min)
        }
        if (def.max !== undefined) {
          numType = numType.max(def.max)
        }
        baseType = numType
      }

      // Date validators
      if (baseType instanceof DateType) {
        let dateType = baseType as DateType
        if (def.min !== undefined) {
          dateType = dateType.min(new Date(def.min))
        }
        if (def.max !== undefined) {
          dateType = dateType.max(new Date(def.max))
        }
        baseType = dateType
      }

      return baseType
    }

    // Nested object (without type property)
    if (typeof fieldDef === 'object' && fieldDef !== null) {
      const nestedShape: Record<string, SchemaType<any, any>> = {}
      for (const [k, v] of Object.entries(fieldDef)) {
        nestedShape[k] = this._parseField(v as MongooseFieldDef)
      }
      return new ObjectType(nestedShape)
    }

    // Type constructors
    if (fieldDef === String) return new StringType()
    if (fieldDef === Number) return new NumberType()
    if (fieldDef === Boolean) return new BooleanType()
    if (fieldDef === Date) return new DateType()
    if (fieldDef === BigInt) return new BigIntType() as any
    if (fieldDef === 'ObjectId') return new ObjectIdType()
    if (fieldDef === 'Buffer') return new MixedType() // TODO: BufferType
    if (fieldDef === 'Mixed') return new MixedType()

    return new MixedType()
  }

  // ============ Schema Methods ============

  /**
   * Add a path to the schema
   */
  add(definition: SchemaDefinition | Record<string, SchemaType<any, any>>, prefix?: string): this {
    for (const [key, fieldDef] of Object.entries(definition)) {
      const fullPath = prefix ? `${prefix}${key}` : key
      if (fieldDef instanceof SchemaType) {
        this._paths.set(fullPath, fieldDef)
      } else {
        this._paths.set(fullPath, this._parseField(fieldDef as MongooseFieldDef))
      }
    }
    return this
  }

  /**
   * Get a path's SchemaType
   */
  path(path: string): SchemaType<any, any> | undefined {
    return this._paths.get(path)
  }

  /**
   * Get all paths
   */
  paths(): Map<string, SchemaType<any, any>> {
    return this._paths
  }

  /**
   * Iterate over all paths (Mongoose-compatible)
   */
  eachPath(fn: (path: string, type: SchemaType<any, any>) => void): void {
    for (const [path, type] of this._paths) {
      fn(path, type)
    }
  }

  /**
   * Check if path exists
   */
  pathType(path: string): 'real' | 'virtual' | 'nested' | 'adhocOrUndefined' {
    if (this._paths.has(path)) return 'real'
    if (this._virtuals.has(path)) return 'virtual'
    // Check for nested paths
    for (const key of this._paths.keys()) {
      if (key.startsWith(path + '.')) return 'nested'
    }
    return 'adhocOrUndefined'
  }

  /**
   * Get required paths
   */
  requiredPaths(): string[] {
    const required: string[] = []
    for (const [path, type] of this._paths) {
      if ((type as any)._required) {
        required.push(path)
      }
    }
    return required
  }

  /**
   * Clone the schema
   */
  clone(): Schema<T> {
    const cloned = new Schema<T>(undefined, { ...this._options })
    cloned._paths = new Map(this._paths)
    cloned._methods = new Map(this._methods)
    cloned._statics = new Map(this._statics)
    cloned._virtuals = new Map(this._virtuals)
    cloned._preHooks = new Map(this._preHooks)
    cloned._postHooks = new Map(this._postHooks)
    cloned._indexes = [...this._indexes]
    cloned._plugins = [...this._plugins]
    return cloned
  }

  // ============ Instance Methods ============

  /**
   * Add an instance method
   */
  method(name: string, fn: Function): this
  method(methods: Record<string, Function>): this
  method(nameOrMethods: string | Record<string, Function>, fn?: Function): this {
    if (typeof nameOrMethods === 'string') {
      this._methods.set(nameOrMethods, fn!)
    } else {
      for (const [name, method] of Object.entries(nameOrMethods)) {
        this._methods.set(name, method)
      }
    }
    return this
  }

  /**
   * Get instance methods (Mongoose-compatible property)
   */
  get methods(): Record<string, Function> {
    return Object.fromEntries(this._methods)
  }

  // ============ Static Methods ============

  /**
   * Add a static method
   */
  static(name: string, fn: Function): this
  static(statics: Record<string, Function>): this
  static(nameOrStatics: string | Record<string, Function>, fn?: Function): this {
    if (typeof nameOrStatics === 'string') {
      this._statics.set(nameOrStatics, fn!)
    } else {
      for (const [name, method] of Object.entries(nameOrStatics)) {
        this._statics.set(name, method)
      }
    }
    return this
  }

  /**
   * Get static methods (Mongoose-compatible property)
   */
  get statics(): Record<string, Function> {
    return Object.fromEntries(this._statics)
  }

  // ============ Virtuals ============

  /**
   * Add a virtual property
   */
  virtual(name: string, options?: VirtualType['options']): VirtualBuilder {
    const virtual: VirtualType = { options }
    this._virtuals.set(name, virtual)
    return new VirtualBuilder(virtual)
  }

  /**
   * Get virtuals
   */
  virtuals(): Map<string, VirtualType> {
    return this._virtuals
  }

  // ============ Middleware ============

  /**
   * Add pre middleware
   */
  pre<K extends HookType>(
    hook: K | K[],
    options: { document?: boolean; query?: boolean } | PreHookFn,
    fn?: PreHookFn
  ): this {
    const hooks = Array.isArray(hook) ? hook : [hook]
    const actualFn = typeof options === 'function' ? options : fn!
    const actualOptions = typeof options === 'function' ? undefined : options

    for (const h of hooks) {
      const existing = this._preHooks.get(h) || []
      existing.push({ fn: actualFn, options: actualOptions })
      this._preHooks.set(h, existing)
    }
    return this
  }

  /**
   * Add post middleware
   */
  post<K extends HookType>(
    hook: K | K[],
    options: { document?: boolean; query?: boolean } | PostHookFn,
    fn?: PostHookFn
  ): this {
    const hooks = Array.isArray(hook) ? hook : [hook]
    const actualFn = typeof options === 'function' ? options : fn!
    const actualOptions = typeof options === 'function' ? undefined : options

    for (const h of hooks) {
      const existing = this._postHooks.get(h) || []
      existing.push({ fn: actualFn, options: actualOptions })
      this._postHooks.set(h, existing)
    }
    return this
  }

  /**
   * Get pre hooks for a specific operation
   */
  getPreHooks(hook: HookType): MiddlewareEntry[] {
    return this._preHooks.get(hook) || []
  }

  /**
   * Get post hooks for a specific operation
   */
  getPostHooks(hook: HookType): MiddlewareEntry[] {
    return this._postHooks.get(hook) || []
  }

  // ============ Indexes ============

  /**
   * Add an index
   */
  index(fields: Record<string, 1 | -1 | 'text' | '2dsphere'>, options?: Record<string, any>): this {
    this._indexes.push({ fields: fields as Record<string, 1 | -1>, options })
    return this
  }

  /**
   * Get all indexes (Mongoose-compatible format: [fields, options][])
   */
  indexes(): Array<[Record<string, 1 | -1>, Record<string, any> | undefined]> {
    return this._indexes.map(idx => [idx.fields, idx.options])
  }

  // ============ Plugins ============

  /**
   * Apply a plugin
   */
  plugin(fn: (schema: Schema<T>, options?: any) => void, options?: any): this {
    fn(this, options)
    this._plugins.push({ fn, options })
    return this
  }

  // ============ Options ============

  /**
   * Schema options (Mongoose-compatible property)
   */
  get options(): SchemaOptions {
    return this._options
  }

  /**
   * Original schema definition (Mongoose-compatible property)
   */
  get obj(): SchemaDefinition {
    return this._definition
  }

  /**
   * Get/set schema options
   */
  set<K extends keyof SchemaOptions>(key: K, value: SchemaOptions[K]): this
  set(options: SchemaOptions): this
  set<K extends keyof SchemaOptions>(keyOrOptions: K | SchemaOptions, value?: SchemaOptions[K]): this {
    if (typeof keyOrOptions === 'string') {
      this._options[keyOrOptions] = value!
    } else {
      Object.assign(this._options, keyOrOptions)
    }
    return this
  }

  get<K extends keyof SchemaOptions>(key: K): SchemaOptions[K] {
    return this._options[key]
  }

  // ============ Validation ============

  /**
   * Validate a document against this schema
   */
  async validate(doc: Record<string, unknown>): Promise<{ valid: boolean; errors: ValidationError[] }> {
    const errors: ValidationError[] = []

    for (const [path, type] of this._paths) {
      const value = doc[path]

      // Check required
      if ((type as any)._required && value == null) {
        errors.push({
          path,
          message: `Path \`${path}\` is required.`,
          kind: 'required',
          value,
        })
        continue
      }

      // Skip validation if value is null/undefined and not required
      if (value == null) continue

      // Run validators
      try {
        const valid = await type._validate(value as any)
        if (!valid) {
          errors.push({
            path,
            message: `Validation failed for path \`${path}\``,
            kind: 'validator',
            value,
          })
        }
      } catch (err) {
        errors.push({
          path,
          message: err instanceof Error ? err.message : 'Validation failed',
          kind: 'validator',
          value,
        })
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Cast a document to schema types
   */
  cast(doc: Record<string, unknown>): T {
    const result: Record<string, unknown> = {}

    for (const [path, type] of this._paths) {
      if (path in doc) {
        result[path] = type._cast(doc[path])
      } else if ((type as any)._options.default !== undefined) {
        const defaultValue = (type as any)._options.default
        result[path] = typeof defaultValue === 'function' ? defaultValue() : defaultValue
      }
    }

    return result as T
  }
}

// ============ Virtual Builder ============

class VirtualBuilder {
  constructor(private virtual: VirtualType) {}

  get(fn: () => any): this {
    this.virtual.get = fn
    return this
  }

  set(fn: (value: any) => void): this {
    this.virtual.set = fn
    return this
  }
}

// ============ Validation Error ============

export interface ValidationError {
  path: string
  message: string
  kind: string
  value: unknown
}

export class MongooseValidationError extends Error {
  errors: Map<string, ValidationError>

  constructor(message: string = 'Validation failed') {
    super(message)
    this.name = 'ValidationError'
    this.errors = new Map()
  }

  addError(path: string, error: ValidationError): void {
    this.errors.set(path, error)
  }
}
