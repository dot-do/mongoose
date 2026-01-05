/**
 * Mongoose.do Database Adapter for Payload CMS
 *
 * This adapter allows Payload CMS to run on Cloudflare Workers
 * using mongoose.do (Mongoose-like ODM) with mongo.do (MongoDB on Durable Objects)
 */

import { Schema, Model, Connection, type SchemaDefinition } from 'mongoose.do'
import type {
  BaseDatabaseAdapter,
  DatabaseAdapterObj,
  Init,
  Connect,
  Create,
  Find,
  FindOne,
  UpdateOne,
  DeleteOne,
  DeleteMany,
  Count,
} from 'payload'

export interface MongooseAdapterArgs {
  /** Durable Object binding for mongo.do */
  binding?: DurableObjectNamespace
  /** Optional: disable transactions (DO doesn't support them yet) */
  disableTransactions?: boolean
}

interface MongooseAdapter extends BaseDatabaseAdapter {
  connection: Connection | null
  models: Map<string, Model<any>>
}

/**
 * Convert Payload field config to Mongoose.do schema definition
 */
function fieldsToSchema(fields: any[]): SchemaDefinition {
  const schemaDef: SchemaDefinition = {}

  for (const field of fields) {
    if (!field.name) continue

    switch (field.type) {
      case 'text':
      case 'textarea':
      case 'code':
      case 'email':
        schemaDef[field.name] = {
          type: String,
          required: field.required ?? false
        }
        break
      case 'number':
        schemaDef[field.name] = {
          type: Number,
          required: field.required ?? false
        }
        break
      case 'checkbox':
        schemaDef[field.name] = {
          type: Boolean,
          required: field.required ?? false,
          default: field.defaultValue ?? false
        }
        break
      case 'date':
        schemaDef[field.name] = {
          type: Date,
          required: field.required ?? false
        }
        break
      case 'relationship':
        schemaDef[field.name] = {
          type: Schema.Types.ObjectId,
          ref: field.relationTo,
          required: field.required ?? false
        }
        break
      case 'array':
        if (field.fields) {
          schemaDef[field.name] = [fieldsToSchema(field.fields)]
        }
        break
      case 'group':
        if (field.fields) {
          schemaDef[field.name] = fieldsToSchema(field.fields)
        }
        break
      case 'select':
        schemaDef[field.name] = {
          type: String,
          enum: field.options?.map((o: any) => typeof o === 'string' ? o : o.value),
          required: field.required ?? false
        }
        break
      case 'json':
        schemaDef[field.name] = {
          type: Schema.Types.Mixed,
          required: field.required ?? false
        }
        break
      case 'upload':
        schemaDef[field.name] = {
          type: Schema.Types.ObjectId,
          ref: field.relationTo,
          required: field.required ?? false
        }
        break
      default:
        // Default to mixed for unknown types
        schemaDef[field.name] = { type: Schema.Types.Mixed }
    }
  }

  return schemaDef
}

/**
 * Build where query from Payload's where clause
 */
function buildQuery(where: any): any {
  if (!where) return {}

  const query: any = {}

  for (const [key, value] of Object.entries(where)) {
    if (key === 'and' && Array.isArray(value)) {
      query.$and = value.map(buildQuery)
    } else if (key === 'or' && Array.isArray(value)) {
      query.$or = value.map(buildQuery)
    } else if (typeof value === 'object' && value !== null) {
      // Handle operators
      const ops = value as Record<string, any>
      if ('equals' in ops) query[key] = ops.equals
      else if ('not_equals' in ops) query[key] = { $ne: ops.not_equals }
      else if ('in' in ops) query[key] = { $in: ops.in }
      else if ('not_in' in ops) query[key] = { $nin: ops.not_in }
      else if ('greater_than' in ops) query[key] = { $gt: ops.greater_than }
      else if ('greater_than_equal' in ops) query[key] = { $gte: ops.greater_than_equal }
      else if ('less_than' in ops) query[key] = { $lt: ops.less_than }
      else if ('less_than_equal' in ops) query[key] = { $lte: ops.less_than_equal }
      else if ('like' in ops) query[key] = { $regex: ops.like, $options: 'i' }
      else if ('contains' in ops) query[key] = { $regex: ops.contains, $options: 'i' }
      else if ('exists' in ops) query[key] = { $exists: ops.exists }
      else query[key] = value
    } else {
      query[key] = value
    }
  }

  return query
}

/**
 * Create the Mongoose.do database adapter for Payload
 */
export function mongooseAdapter(args: MongooseAdapterArgs = {}): DatabaseAdapterObj<MongooseAdapter> {
  const { disableTransactions = true } = args

  return {
    name: 'mongoose.do',

    init: async function init({ payload }): Promise<MongooseAdapter> {
      const adapter = this as unknown as MongooseAdapter
      adapter.models = new Map()
      adapter.connection = null

      // Build schemas for all collections
      for (const collection of payload.config.collections) {
        const schemaDef = fieldsToSchema(collection.fields)

        // Add standard Payload fields
        schemaDef.createdAt = { type: Date, default: () => new Date() }
        schemaDef.updatedAt = { type: Date, default: () => new Date() }

        const schema = new Schema(schemaDef, {
          timestamps: true,
          collection: collection.slug
        })

        const model = new Model(collection.slug, schema)
        adapter.models.set(collection.slug, model)
      }

      // Build schemas for globals
      if (payload.config.globals) {
        for (const global of payload.config.globals) {
          const schemaDef = fieldsToSchema(global.fields)
          schemaDef.globalType = { type: String, default: global.slug }
          schemaDef.createdAt = { type: Date, default: () => new Date() }
          schemaDef.updatedAt = { type: Date, default: () => new Date() }

          const schema = new Schema(schemaDef, {
            timestamps: true,
            collection: `globals_${global.slug}`
          })

          const model = new Model(`globals_${global.slug}`, schema)
          adapter.models.set(`globals_${global.slug}`, model)
        }
      }

      return adapter
    },

    connect: async function connect({ payload }) {
      const adapter = this as unknown as MongooseAdapter
      // Connection is established per-request in Workers
      // The actual DB binding is passed via env
      adapter.connection = new Connection()
      return
    },

    destroy: async function destroy() {
      const adapter = this as unknown as MongooseAdapter
      adapter.connection = null
      adapter.models.clear()
    },

    // CRUD Operations
    create: async function create({ collection, data, req }) {
      const adapter = this as unknown as MongooseAdapter
      const model = adapter.models.get(collection)
      if (!model) throw new Error(`Collection ${collection} not found`)

      const db = (req as any)?.context?.env?.MONGODB
      if (db) model.setConnection(new Connection(db))

      const doc = await model.create(data)
      return { ...doc.toObject(), id: doc._id?.toString() }
    },

    find: async function find({ collection, where, limit, page, sort, req }) {
      const adapter = this as unknown as MongooseAdapter
      const model = adapter.models.get(collection)
      if (!model) throw new Error(`Collection ${collection} not found`)

      const db = (req as any)?.context?.env?.MONGODB
      if (db) model.setConnection(new Connection(db))

      const query = model.find(buildQuery(where))

      if (sort) {
        const sortObj: Record<string, 1 | -1> = {}
        if (typeof sort === 'string') {
          const desc = sort.startsWith('-')
          sortObj[desc ? sort.slice(1) : sort] = desc ? -1 : 1
        }
        query.sort(sortObj)
      }

      const skip = page && limit ? (page - 1) * limit : 0
      if (skip) query.skip(skip)
      if (limit) query.limit(limit)

      const docs = await query.exec()
      const totalDocs = await model.countDocuments(buildQuery(where))

      return {
        docs: docs.map((d: any) => ({ ...d.toObject(), id: d._id?.toString() })),
        totalDocs,
        totalPages: limit ? Math.ceil(totalDocs / limit) : 1,
        page: page ?? 1,
        limit: limit ?? totalDocs,
        hasNextPage: limit ? (page ?? 1) * limit < totalDocs : false,
        hasPrevPage: (page ?? 1) > 1,
        pagingCounter: skip + 1,
        prevPage: page && page > 1 ? page - 1 : null,
        nextPage: limit && (page ?? 1) * limit < totalDocs ? (page ?? 1) + 1 : null
      }
    },

    findOne: async function findOne({ collection, where, req }) {
      const adapter = this as unknown as MongooseAdapter
      const model = adapter.models.get(collection)
      if (!model) throw new Error(`Collection ${collection} not found`)

      const db = (req as any)?.context?.env?.MONGODB
      if (db) model.setConnection(new Connection(db))

      const doc = await model.findOne(buildQuery(where))
      return doc ? { ...doc.toObject(), id: doc._id?.toString() } : null
    },

    updateOne: async function updateOne({ collection, where, data, req }) {
      const adapter = this as unknown as MongooseAdapter
      const model = adapter.models.get(collection)
      if (!model) throw new Error(`Collection ${collection} not found`)

      const db = (req as any)?.context?.env?.MONGODB
      if (db) model.setConnection(new Connection(db))

      const doc = await model.findOneAndUpdate(
        buildQuery(where),
        { ...data, updatedAt: new Date() },
        { new: true }
      )
      return doc ? { ...doc.toObject(), id: doc._id?.toString() } : null
    },

    deleteOne: async function deleteOne({ collection, where, req }) {
      const adapter = this as unknown as MongooseAdapter
      const model = adapter.models.get(collection)
      if (!model) throw new Error(`Collection ${collection} not found`)

      const db = (req as any)?.context?.env?.MONGODB
      if (db) model.setConnection(new Connection(db))

      const doc = await model.findOne(buildQuery(where))
      if (doc) {
        await model.deleteOne(buildQuery(where))
        return { ...doc.toObject(), id: doc._id?.toString() }
      }
      return null
    },

    deleteMany: async function deleteMany({ collection, where, req }) {
      const adapter = this as unknown as MongooseAdapter
      const model = adapter.models.get(collection)
      if (!model) throw new Error(`Collection ${collection} not found`)

      const db = (req as any)?.context?.env?.MONGODB
      if (db) model.setConnection(new Connection(db))

      const docs = await model.find(buildQuery(where)).exec()
      await model.deleteMany(buildQuery(where))
      return docs.map((d: any) => ({ ...d.toObject(), id: d._id?.toString() }))
    },

    count: async function count({ collection, where, req }) {
      const adapter = this as unknown as MongooseAdapter
      const model = adapter.models.get(collection)
      if (!model) throw new Error(`Collection ${collection} not found`)

      const db = (req as any)?.context?.env?.MONGODB
      if (db) model.setConnection(new Connection(db))

      return model.countDocuments(buildQuery(where))
    },

    // Transaction stubs (Durable Objects don't support transactions yet)
    beginTransaction: async function beginTransaction() {
      return null // No-op
    },

    commitTransaction: async function commitTransaction() {
      return // No-op
    },

    rollbackTransaction: async function rollbackTransaction() {
      return // No-op
    },

    // Globals
    createGlobal: async function createGlobal({ slug, data, req }) {
      const adapter = this as unknown as MongooseAdapter
      const model = adapter.models.get(`globals_${slug}`)
      if (!model) throw new Error(`Global ${slug} not found`)

      const db = (req as any)?.context?.env?.MONGODB
      if (db) model.setConnection(new Connection(db))

      const doc = await model.create({ ...data, globalType: slug })
      return { ...doc.toObject(), id: doc._id?.toString() }
    },

    findGlobal: async function findGlobal({ slug, req }) {
      const adapter = this as unknown as MongooseAdapter
      const model = adapter.models.get(`globals_${slug}`)
      if (!model) throw new Error(`Global ${slug} not found`)

      const db = (req as any)?.context?.env?.MONGODB
      if (db) model.setConnection(new Connection(db))

      const doc = await model.findOne({ globalType: slug })
      return doc ? { ...doc.toObject(), id: doc._id?.toString() } : null
    },

    updateGlobal: async function updateGlobal({ slug, data, req }) {
      const adapter = this as unknown as MongooseAdapter
      const model = adapter.models.get(`globals_${slug}`)
      if (!model) throw new Error(`Global ${slug} not found`)

      const db = (req as any)?.context?.env?.MONGODB
      if (db) model.setConnection(new Connection(db))

      const doc = await model.findOneAndUpdate(
        { globalType: slug },
        { ...data, updatedAt: new Date() },
        { new: true, upsert: true }
      )
      return doc ? { ...doc.toObject(), id: doc._id?.toString() } : null
    },

    // Version stubs (can be implemented later)
    createVersion: async () => ({ id: '' } as any),
    findVersions: async () => ({ docs: [], totalDocs: 0, totalPages: 0, page: 1, limit: 10, hasNextPage: false, hasPrevPage: false, pagingCounter: 1, prevPage: null, nextPage: null }),
    countVersions: async () => 0,
    updateVersion: async () => null,
    deleteVersions: async () => [],
    createGlobalVersion: async () => ({ id: '' } as any),
    findGlobalVersions: async () => ({ docs: [], totalDocs: 0, totalPages: 0, page: 1, limit: 10, hasNextPage: false, hasPrevPage: false, pagingCounter: 1, prevPage: null, nextPage: null }),
    countGlobalVersions: async () => 0,
    updateGlobalVersion: async () => null,

    // Migration stubs
    createMigration: async () => {},
    migrateFresh: async () => {},

    // Query drafts stub
    queryDrafts: async () => ({ docs: [], totalDocs: 0, totalPages: 0, page: 1, limit: 10, hasNextPage: false, hasPrevPage: false, pagingCounter: 1, prevPage: null, nextPage: null }),

    // Upsert
    upsert: async function upsert({ collection, where, data, req }) {
      const adapter = this as unknown as MongooseAdapter
      const model = adapter.models.get(collection)
      if (!model) throw new Error(`Collection ${collection} not found`)

      const db = (req as any)?.context?.env?.MONGODB
      if (db) model.setConnection(new Connection(db))

      const doc = await model.findOneAndUpdate(
        buildQuery(where),
        { ...data, updatedAt: new Date() },
        { new: true, upsert: true }
      )
      return doc ? { ...doc.toObject(), id: doc._id?.toString() } : null
    },

    // Required but not used
    updateMany: async function updateMany({ collection, where, data, req }) {
      const adapter = this as unknown as MongooseAdapter
      const model = adapter.models.get(collection)
      if (!model) throw new Error(`Collection ${collection} not found`)

      const db = (req as any)?.context?.env?.MONGODB
      if (db) model.setConnection(new Connection(db))

      await model.updateMany(buildQuery(where), { ...data, updatedAt: new Date() })
      const docs = await model.find(buildQuery(where)).exec()
      return docs.map((d: any) => ({ ...d.toObject(), id: d._id?.toString() }))
    },

    findDistinct: async function findDistinct({ collection, field, where, req }) {
      const adapter = this as unknown as MongooseAdapter
      const model = adapter.models.get(collection)
      if (!model) throw new Error(`Collection ${collection} not found`)

      const db = (req as any)?.context?.env?.MONGODB
      if (db) model.setConnection(new Connection(db))

      // Get all docs and extract distinct values
      const docs = await model.find(buildQuery(where)).exec()
      const values = new Set(docs.map((d: any) => d[field]))
      return Array.from(values)
    },
  } as unknown as DatabaseAdapterObj<MongooseAdapter>
}

export default mongooseAdapter
