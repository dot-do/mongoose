/**
 * Core types for Mondoo
 */

import type { ObjectId } from 'mondodb'

// Re-export ObjectId from mondodb
export type { ObjectId }

/**
 * Schema type markers for type inference
 */
export interface SchemaTypeOptions<T = unknown> {
  type?: T
  required?: boolean
  default?: T | (() => T)
  validate?: ((value: T) => boolean | Promise<boolean>) | RegExp
  enum?: readonly T[]
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  match?: RegExp
  ref?: string
  index?: boolean
  unique?: boolean
  sparse?: boolean
}

/**
 * Base schema type - all schema types extend this
 */
export abstract class SchemaType<T, Required extends boolean = false> {
  abstract readonly _type: T
  abstract readonly _required: Required

  protected _options: SchemaTypeOptions<T> = {}
  protected _validators: Array<(value: T) => boolean | Promise<boolean>> = []

  required(): SchemaType<T, true> {
    const clone = this._clone()
    ;(clone as any)._required = true
    clone._options.required = true
    return clone as unknown as SchemaType<T, true>
  }

  default(value: T | (() => T)): this {
    const clone = this._clone()
    clone._options.default = value
    return clone as this
  }

  validate(fn: (value: T) => boolean | Promise<boolean>): this {
    const clone = this._clone()
    clone._validators.push(fn)
    return clone as this
  }

  index(value: boolean = true): this {
    const clone = this._clone()
    clone._options.index = value
    return clone as this
  }

  unique(value: boolean = true): this {
    const clone = this._clone()
    clone._options.unique = value
    return clone as this
  }

  protected abstract _clone(): this

  /** @internal */
  _getOptions(): SchemaTypeOptions<T> {
    return this._options
  }

  /** @internal */
  _getValidators(): Array<(value: T) => boolean | Promise<boolean>> {
    return this._validators
  }

  /** @internal */
  abstract _cast(value: unknown): T

  /** @internal */
  async _validate(value: T): Promise<boolean> {
    for (const validator of this._validators) {
      const result = await validator(value)
      if (!result) return false
    }
    return true
  }
}

/**
 * String schema type
 */
export class StringType<R extends boolean = false> extends SchemaType<string, R> {
  readonly _type!: string
  readonly _required!: R

  protected _clone(): this {
    const clone = new StringType() as this
    clone._options = { ...this._options }
    clone._validators = [...this._validators]
    return clone
  }

  _cast(value: unknown): string {
    if (value == null) return ''
    return String(value)
  }

  email(): this {
    return this.validate((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
  }

  url(): this {
    return this.validate((v) => {
      try { new URL(v); return true } catch { return false }
    })
  }

  uuid(): this {
    return this.validate((v) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    )
  }

  regex(pattern: RegExp): this {
    return this.validate((v) => pattern.test(v))
  }

  min(length: number): this {
    const clone = this._clone()
    clone._options.minLength = length
    return clone.validate((v) => v.length >= length)
  }

  max(length: number): this {
    const clone = this._clone()
    clone._options.maxLength = length
    return clone.validate((v) => v.length <= length)
  }

  length(len: number): this {
    return this.min(len).max(len)
  }

  trim(): this {
    // This would be a transform, not just validation
    return this
  }

  lowercase(): this {
    return this
  }

  uppercase(): this {
    return this
  }
}

/**
 * Number schema type
 */
export class NumberType<R extends boolean = false> extends SchemaType<number, R> {
  readonly _type!: number
  readonly _required!: R

  protected _clone(): this {
    const clone = new NumberType() as this
    clone._options = { ...this._options }
    clone._validators = [...this._validators]
    return clone
  }

  _cast(value: unknown): number {
    if (value == null) return 0
    const num = Number(value)
    return isNaN(num) ? 0 : num
  }

  min(value: number): this {
    const clone = this._clone()
    clone._options.min = value
    return clone.validate((v) => v >= value)
  }

  max(value: number): this {
    const clone = this._clone()
    clone._options.max = value
    return clone.validate((v) => v <= value)
  }

  int(): this {
    return this.validate((v) => Number.isInteger(v))
  }

  positive(): this {
    return this.validate((v) => v > 0)
  }

  negative(): this {
    return this.validate((v) => v < 0)
  }

  finite(): this {
    return this.validate((v) => Number.isFinite(v))
  }
}

/**
 * Boolean schema type
 */
export class BooleanType<R extends boolean = false> extends SchemaType<boolean, R> {
  readonly _type!: boolean
  readonly _required!: R

  protected _clone(): this {
    const clone = new BooleanType() as this
    clone._options = { ...this._options }
    clone._validators = [...this._validators]
    return clone
  }

  _cast(value: unknown): boolean {
    return Boolean(value)
  }
}

/**
 * Date schema type
 */
export class DateType<R extends boolean = false> extends SchemaType<Date, R> {
  readonly _type!: Date
  readonly _required!: R

  protected _clone(): this {
    const clone = new DateType() as this
    clone._options = { ...this._options }
    clone._validators = [...this._validators]
    return clone
  }

  _cast(value: unknown): Date {
    if (value instanceof Date) return value
    if (typeof value === 'string' || typeof value === 'number') {
      return new Date(value)
    }
    return new Date()
  }

  min(date: Date | string | number): this {
    const minDate = new Date(date)
    return this.validate((v) => v >= minDate)
  }

  max(date: Date | string | number): this {
    const maxDate = new Date(date)
    return this.validate((v) => v <= maxDate)
  }
}

/**
 * ObjectId schema type with ref support
 */
export class ObjectIdType<R extends boolean = false, RefModel extends string = never> extends SchemaType<ObjectId, R> {
  readonly _type!: ObjectId
  readonly _required!: R
  readonly _ref!: RefModel

  protected _clone(): this {
    const clone = new ObjectIdType() as this
    clone._options = { ...this._options }
    clone._validators = [...this._validators]
    return clone
  }

  _cast(value: unknown): ObjectId {
    // TODO: Implement proper ObjectId casting from mondodb
    return value as ObjectId
  }

  override async _validate(value: ObjectId): Promise<boolean> {
    if (!(await super._validate(value))) return false
    // Validate 24-character hex string format
    if (typeof value === 'string') {
      return /^[0-9a-fA-F]{24}$/.test(value)
    }
    // If it's already an ObjectId object, assume valid
    return value != null
  }

  ref<M extends string>(model: M): ObjectIdType<R, M> {
    const clone = this._clone() as unknown as ObjectIdType<R, M>
    clone._options.ref = model
    return clone
  }
}

/**
 * Array schema type
 */
export class ArrayType<T, R extends boolean = false> extends SchemaType<T[], R> {
  readonly _type!: T[]
  readonly _required!: R
  readonly _itemType: SchemaType<T, any>

  constructor(itemType: SchemaType<T, any>) {
    super()
    this._itemType = itemType
  }

  protected _clone(): this {
    const clone = new ArrayType(this._itemType) as this
    clone._options = { ...this._options }
    clone._validators = [...this._validators]
    return clone
  }

  _cast(value: unknown): T[] {
    if (!Array.isArray(value)) return []
    return value.map((item) => this._itemType._cast(item))
  }

  override async _validate(value: T[]): Promise<boolean> {
    // First run base validators
    if (!(await super._validate(value))) return false
    // Then validate each item
    for (const item of value) {
      if (!(await this._itemType._validate(item))) return false
    }
    return true
  }

  min(length: number): this {
    return this.validate((v) => v.length >= length)
  }

  max(length: number): this {
    return this.validate((v) => v.length <= length)
  }

  length(len: number): this {
    return this.min(len).max(len)
  }

  nonempty(): this {
    return this.min(1)
  }
}

/**
 * Object schema type for nested schemas
 */
export class ObjectType<T extends Record<string, SchemaType<any, any>>, R extends boolean = false> extends SchemaType<InferObject<T>, R> {
  readonly _type!: InferObject<T>
  readonly _required!: R
  readonly _shape: T

  constructor(shape: T) {
    super()
    this._shape = shape
  }

  protected _clone(): this {
    const clone = new ObjectType(this._shape) as this
    clone._options = { ...this._options }
    clone._validators = [...this._validators]
    return clone
  }

  _cast(value: unknown): InferObject<T> {
    if (typeof value !== 'object' || value === null) return {} as InferObject<T>
    const result: Record<string, unknown> = {}
    for (const [key, type] of Object.entries(this._shape)) {
      result[key] = type._cast((value as Record<string, unknown>)[key])
    }
    return result as InferObject<T>
  }
}

/**
 * Enum schema type
 */
export class EnumType<T extends readonly string[], R extends boolean = false> extends SchemaType<T[number], R> {
  readonly _type!: T[number]
  readonly _required!: R
  readonly _values: T

  constructor(values: T) {
    super()
    this._values = values
    this._options.enum = values
  }

  protected _clone(): this {
    const clone = new EnumType(this._values) as this
    clone._options = { ...this._options }
    clone._validators = [...this._validators]
    return clone
  }

  _cast(value: unknown): T[number] {
    return value as T[number]
  }

  override async _validate(value: T[number]): Promise<boolean> {
    if (!(await super._validate(value))) return false
    return this._values.includes(value as T[number])
  }
}

/**
 * Literal schema type
 */
export class LiteralType<T extends string | number | boolean, R extends boolean = false> extends SchemaType<T, R> {
  readonly _type!: T
  readonly _required!: R
  readonly _value: T

  constructor(value: T) {
    super()
    this._value = value
  }

  protected _clone(): this {
    const clone = new LiteralType(this._value) as this
    clone._options = { ...this._options }
    clone._validators = [...this._validators]
    return clone
  }

  _cast(value: unknown): T {
    return this._value
  }

  override async _validate(value: T): Promise<boolean> {
    if (!(await super._validate(value))) return false
    return value === this._value
  }
}

/**
 * Map schema type
 */
export class MapType<T, R extends boolean = false> extends SchemaType<Map<string, T>, R> {
  readonly _type!: Map<string, T>
  readonly _required!: R
  readonly _valueType: SchemaType<T, any>

  constructor(valueType: SchemaType<T, any>) {
    super()
    this._valueType = valueType
  }

  protected _clone(): this {
    const clone = new MapType(this._valueType) as this
    clone._options = { ...this._options }
    clone._validators = [...this._validators]
    return clone
  }

  _cast(value: unknown): Map<string, T> {
    if (value instanceof Map) return value as Map<string, T>
    if (typeof value === 'object' && value !== null) {
      const map = new Map<string, T>()
      for (const [k, v] of Object.entries(value)) {
        map.set(k, this._valueType._cast(v))
      }
      return map
    }
    return new Map()
  }

  override async _validate(value: Map<string, T> | Record<string, T>): Promise<boolean> {
    if (!(await super._validate(value as Map<string, T>))) return false
    // Handle both Map and plain objects
    const entries = value instanceof Map ? value.entries() : Object.entries(value)
    for (const [, v] of entries) {
      if (!(await this._valueType._validate(v))) return false
    }
    return true
  }
}

/**
 * Mixed/Any schema type
 */
export class MixedType<R extends boolean = false> extends SchemaType<unknown, R> {
  readonly _type!: unknown
  readonly _required!: R

  protected _clone(): this {
    const clone = new MixedType() as this
    clone._options = { ...this._options }
    clone._validators = [...this._validators]
    return clone
  }

  _cast(value: unknown): unknown {
    return value
  }
}

/**
 * Buffer schema type
 */
export class BufferType<R extends boolean = false> extends SchemaType<ArrayBuffer, R> {
  readonly _type!: ArrayBuffer
  readonly _required!: R

  protected _clone(): this {
    const clone = new BufferType() as this
    clone._options = { ...this._options }
    clone._validators = [...this._validators]
    return clone
  }

  _cast(value: unknown): ArrayBuffer {
    if (value instanceof ArrayBuffer) return value
    if (typeof value === 'string') {
      return new TextEncoder().encode(value).buffer
    }
    return new ArrayBuffer(0)
  }
}

/**
 * BigInt schema type
 */
export class BigIntType<R extends boolean = false> extends SchemaType<bigint, R> {
  readonly _type!: bigint
  readonly _required!: R

  protected _clone(): this {
    const clone = new BigIntType() as this
    clone._options = { ...this._options }
    clone._validators = [...this._validators]
    return clone
  }

  _cast(value: unknown): bigint {
    if (typeof value === 'bigint') return value
    if (typeof value === 'number' || typeof value === 'string') {
      try { return BigInt(value) } catch { return BigInt(0) }
    }
    return BigInt(0)
  }
}

// ============ Type Inference Utilities ============

/**
 * Infer the TypeScript type from a SchemaType
 */
export type InferSchemaType<T> = T extends SchemaType<infer V, infer R>
  ? R extends true ? V : V | undefined
  : never

/**
 * Infer object type from object shape
 */
export type InferObject<T extends Record<string, SchemaType<any, any>>> = {
  [K in keyof T as T[K] extends SchemaType<any, true> ? K : never]: InferSchemaType<T[K]>
} & {
  [K in keyof T as T[K] extends SchemaType<any, true> ? never : K]?: InferSchemaType<T[K]>
}

/**
 * Infer the full document type from a schema shape
 */
export type InferSchema<T extends Record<string, SchemaType<any, any>>> = InferObject<T> & { _id: ObjectId }

/**
 * Transform populated paths - replace ObjectId refs with actual documents
 */
export type PopulatedDoc<T, Paths extends keyof T = never> = {
  [K in keyof T]: K extends Paths
    ? T[K] extends ObjectId | undefined
      ? unknown  // Would be the referenced document type
      : T[K] extends (ObjectId | undefined)[]
        ? unknown[]
        : T[K]
    : T[K]
}
