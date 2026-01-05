/**
 * The $ namespace - Zod-style API for Mondoo
 *
 * @example
 * ```typescript
 * import { $ } from 'mondoo'
 *
 * const userSchema = $.schema({
 *   name: $.string().required(),
 *   email: $.string().email(),
 *   age: $.number().min(0).max(150),
 *   role: $.enum(['admin', 'user', 'guest']),
 *   posts: $.array($.objectId().ref('Post'))
 * })
 *
 * type User = $.infer<typeof userSchema>
 * ```
 */

import {
  StringType,
  NumberType,
  BooleanType,
  DateType,
  ObjectIdType,
  ArrayType,
  ObjectType,
  EnumType,
  LiteralType,
  MapType,
  MixedType,
  BufferType,
  BigIntType,
  SchemaType,
  type InferSchema,
  type InferObject,
} from './types/index.js'
import { Schema, type SchemaDefinition } from './schema/index.js'

/**
 * The $ namespace - TypeScript-first schema builder
 */
export const $ = {
  // ============ Primitive Types ============

  /**
   * Create a string schema type
   * @example $.string().email().required()
   */
  string: () => new StringType(),

  /**
   * Create a number schema type
   * @example $.number().min(0).max(100)
   */
  number: () => new NumberType(),

  /**
   * Create a boolean schema type
   */
  boolean: () => new BooleanType(),

  /**
   * Create a date schema type
   * @example $.date().min(new Date('2020-01-01'))
   */
  date: () => new DateType(),

  /**
   * Create an ObjectId schema type
   * @example $.objectId().ref('User')
   */
  objectId: () => new ObjectIdType(),

  /**
   * Create a buffer/binary schema type
   */
  buffer: () => new BufferType(),

  /**
   * Create a bigint schema type
   */
  bigint: () => new BigIntType(),

  // ============ Complex Types ============

  /**
   * Create an array schema type
   * @example $.array($.string())
   */
  array: <T>(itemType: SchemaType<T, any>) => new ArrayType(itemType),

  /**
   * Create a nested object schema type
   * @example $.object({ name: $.string(), age: $.number() })
   */
  object: <T extends Record<string, SchemaType<any, any>>>(shape: T) => new ObjectType(shape),

  /**
   * Create a map schema type (string keys, typed values)
   * @example $.map($.number())
   */
  map: <T>(valueType: SchemaType<T, any>) => new MapType(valueType),

  // ============ Unions & Enums ============

  /**
   * Create an enum schema type
   * @example $.enum(['admin', 'user', 'guest'])
   */
  enum: <T extends readonly string[]>(values: T) => new EnumType(values),

  /**
   * Create a literal schema type
   * @example $.literal('active')
   */
  literal: <T extends string | number | boolean>(value: T) => new LiteralType(value),

  // ============ Special Types ============

  /**
   * Create a mixed/any schema type (no type checking)
   */
  mixed: () => new MixedType(),

  /**
   * Alias for mixed()
   */
  any: () => new MixedType(),

  // ============ Schema Creation ============

  /**
   * Create a new schema from a shape definition
   * @example
   * ```typescript
   * const userSchema = $.schema({
   *   name: $.string().required(),
   *   email: $.string().email()
   * })
   * ```
   */
  schema: <T extends Record<string, SchemaType<any, any>>>(
    shape: T,
    options?: SchemaOptions
  ): Schema<InferObject<T>> => {
    return Schema.fromZodStyle(shape, options)
  },

  // ============ Type Inference ============

  /**
   * Infer TypeScript type from schema (compile-time only)
   * @example type User = $.infer<typeof userSchema>
   */
  infer: null as unknown as InferHelper,

  /**
   * Infer input type (before transforms)
   */
  input: null as unknown as InferHelper,

  /**
   * Infer output type (after transforms)
   */
  output: null as unknown as InferHelper,
}

// Type helper for $.infer
type InferHelper = <T extends Schema<any>>() => T extends Schema<infer U> ? U : never

// Schema options
export interface SchemaOptions {
  timestamps?: boolean
  versionKey?: boolean | string
  strict?: boolean | 'throw'
  collection?: string
  discriminatorKey?: string
}

// Export the $ type for module augmentation
export type $ = typeof $
