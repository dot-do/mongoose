/**
 * Mongoose.do - Mongoose-compatible ODM for Cloudflare Durable Objects
 *
 * Supports two APIs:
 * 1. $ namespace - Zod-style TypeScript-first API
 * 2. Schema/Model - Mongoose-compatible API
 *
 * @example
 * ```typescript
 * // $ API (recommended for new projects)
 * import { $, model, createMongoose } from 'mongoose.do'
 *
 * const userSchema = $.schema({
 *   name: $.string().required(),
 *   email: $.string().email(),
 *   age: $.number().min(0)
 * })
 * type User = $.infer<typeof userSchema>
 *
 * const User = model('User', userSchema)
 *
 * // Mongoose API (for migrations)
 * import { Schema, model } from 'mongoose.do'
 *
 * const userSchema = new Schema({
 *   name: { type: String, required: true },
 *   email: String,
 *   age: { type: Number, min: 0 }
 * })
 * const User = model('User', userSchema)
 * ```
 *
 * @module mongoose.do
 */

// ============ $ Namespace (Zod-style API) ============
export { $ } from './$.js'

// ============ Schema ============
export {
  Schema,
  Types,
  type SchemaDefinition,
  type SchemaOptions,
  type HookType,
  type PreHookFn,
  type PostHookFn,
  type ValidationError,
  MongooseValidationError,
} from './schema/index.js'

// ============ Types ============
export {
  // Schema Types
  SchemaType,
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

  // Type inference utilities
  type SchemaTypeOptions,
  type InferSchemaType,
  type InferObject,
  type InferSchema,
  type PopulatedDoc,
  type ObjectId,
} from './types/index.js'

// ============ Document ============
export {
  Document,
  type DocumentInternal,
  type ToObjectOptions,
} from './document/index.js'

// ============ Model ============
export {
  Model,
  model,
  getModel,
  hasModel,
  deleteModel,
  modelNames,
  type ModelConstructor,
  type UpdateResult,
  type DeleteResult,
  type BulkWriteResult,
  type BulkWriteOperation,
} from './model/index.js'

// ============ Query ============
export {
  Query,
  QueryCursor,
  type QueryOptions,
  type PopulateOptions,
} from './query/index.js'

// ============ Aggregate ============
export {
  Aggregate,
  AggregateCursor,
  type AggregateOptions,
  type LookupOptions,
  type UnwindOptions,
  type BucketOptions,
  type BucketAutoOptions,
  type MergeOptions,
  type GraphLookupOptions,
  type GeoNearOptions,
  type SampleOptions,
  type UnionWithOptions,
} from './aggregate/index.js'

// ============ Middleware ============
export {
  MiddlewareChain,
  MiddlewareManager,
  MiddlewareError,
  executePreHooks,
  executePostHooks,
  executeWithHooks,
  createDocumentContext,
  createQueryContext,
  createAggregateContext,
  createModelContext,
  isDocumentHook,
  isQueryHook,
  isModelHook,
  isAggregateHook,
  type DocumentHookType,
  type QueryHookType,
  type ModelHookType,
  type AggregateHookType,
} from './middleware/index.js'

// ============ Population ============
export {
  populate,
  collectPopulatePaths,
  resolveRefModel,
  assignPopulated,
  depopulate,
  isPopulated,
  setModelRegistry,
  type PopulateOptions as PopulationOptions,
} from './population/index.js'

// ============ Connection ============
export {
  Connection,
  createMongoose,
  connect,
  disconnect,
  defaultConnection,
  connection,
  STATES,
  type ConnectionState,
  type ConnectionEventType,
  type ConnectionOptions,
  type WorkerEnv,
  type SessionOptions,
  type ClientSession,
} from './connection/index.js'

// ============ Default Export ============

import { $ } from './$.js'
import { Schema, Types } from './schema/index.js'
import { Document } from './document/index.js'
import { Model, model, getModel, hasModel, deleteModel, modelNames } from './model/index.js'
import { Query } from './query/index.js'
import { Aggregate } from './aggregate/index.js'
import {
  Connection,
  createMongoose,
  connect,
  disconnect,
  connection,
  STATES,
} from './connection/index.js'
import { populate } from './population/index.js'

/**
 * The main mongoose.do export - mimics mongoose's default export
 */
const mongoose = {
  // $ API
  $,

  // Core classes
  Schema,
  Document,
  Model,
  Query,
  Aggregate,
  Connection,

  // Type constructors
  Types,

  // Model management
  model,
  getModel,
  hasModel,
  deleteModel,
  modelNames,

  // Connection management
  createMongoose,
  connect,
  disconnect,
  connection,
  STATES,

  // Population
  populate,

  // Version
  version: '0.1.0',
}

export default mongoose
