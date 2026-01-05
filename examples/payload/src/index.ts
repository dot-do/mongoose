/**
 * Mongoose.do + MongoDB.do Demo on Cloudflare Workers
 *
 * This demonstrates the mongoose.do ODM working with mongo.do (MongoDB on Durable Objects).
 * This is a foundation for running Payload CMS on Workers with Durable Objects.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'

// Types
interface Env {
  MONGODB: DurableObjectNamespace
  R2?: R2Bucket
}

interface Post {
  _id?: string
  title: string
  content?: string
  status: 'draft' | 'published'
  author?: string
  createdAt?: string
  updatedAt?: string
}

interface User {
  _id?: string
  email: string
  name?: string
  role: 'admin' | 'user'
  createdAt?: string
}

// MongoDB Durable Object - simple implementation for demo
export class MongoDBDurableObject {
  private state: DurableObjectState
  private collections: Map<string, Map<string, any>> = new Map()

  constructor(state: DurableObjectState) {
    this.state = state
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const body = request.method !== 'GET' ? await request.json() : null

    try {
      const result = await this.handleOperation(body)
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  private async handleOperation(op: any): Promise<any> {
    const { method, collection, filter, data, options } = op || {}

    // Ensure collection exists
    if (!this.collections.has(collection)) {
      this.collections.set(collection, new Map())
    }
    const coll = this.collections.get(collection)!

    // Load from storage on first access
    const stored = await this.state.storage.get<any[]>(`collection:${collection}`)
    if (stored && coll.size === 0) {
      for (const doc of stored) {
        coll.set(doc._id, doc)
      }
    }

    switch (method) {
      case 'insertOne': {
        const _id = crypto.randomUUID()
        const doc = { ...data, _id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        coll.set(_id, doc)
        await this.persist(collection)
        return { insertedId: _id, doc }
      }

      case 'find': {
        const docs = Array.from(coll.values()).filter(doc => this.matchFilter(doc, filter))
        if (options?.sort) {
          const [field, order] = Object.entries(options.sort)[0] as [string, number]
          docs.sort((a, b) => order * (a[field] > b[field] ? 1 : -1))
        }
        const skip = options?.skip || 0
        const limit = options?.limit || docs.length
        return { docs: docs.slice(skip, skip + limit), totalDocs: docs.length }
      }

      case 'findOne': {
        const doc = Array.from(coll.values()).find(doc => this.matchFilter(doc, filter))
        return { doc: doc || null }
      }

      case 'updateOne': {
        const doc = Array.from(coll.values()).find(d => this.matchFilter(d, filter))
        if (doc) {
          const updated = { ...doc, ...data.$set, updatedAt: new Date().toISOString() }
          coll.set(doc._id, updated)
          await this.persist(collection)
          return { modifiedCount: 1, doc: updated }
        }
        return { modifiedCount: 0, doc: null }
      }

      case 'deleteOne': {
        const doc = Array.from(coll.values()).find(d => this.matchFilter(d, filter))
        if (doc) {
          coll.delete(doc._id)
          await this.persist(collection)
          return { deletedCount: 1 }
        }
        return { deletedCount: 0 }
      }

      case 'countDocuments': {
        const count = Array.from(coll.values()).filter(doc => this.matchFilter(doc, filter)).length
        return { count }
      }

      default:
        throw new Error(`Unknown method: ${method}`)
    }
  }

  private matchFilter(doc: any, filter: any): boolean {
    if (!filter || Object.keys(filter).length === 0) return true
    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === 'object' && value !== null) {
        // Handle operators
        for (const [op, val] of Object.entries(value as Record<string, any>)) {
          switch (op) {
            case '$eq': if (doc[key] !== val) return false; break
            case '$ne': if (doc[key] === val) return false; break
            case '$gt': if (doc[key] <= val) return false; break
            case '$gte': if (doc[key] < val) return false; break
            case '$lt': if (doc[key] >= val) return false; break
            case '$lte': if (doc[key] > val) return false; break
            case '$in': if (!val.includes(doc[key])) return false; break
            case '$regex': if (!new RegExp(val, 'i').test(doc[key])) return false; break
          }
        }
      } else if (doc[key] !== value) {
        return false
      }
    }
    return true
  }

  private async persist(collection: string) {
    const coll = this.collections.get(collection)!
    await this.state.storage.put(`collection:${collection}`, Array.from(coll.values()))
  }
}

// Helper to call MongoDB DO
async function db(env: Env, op: any) {
  const id = env.MONGODB.idFromName('default')
  const stub = env.MONGODB.get(id)
  const response = await stub.fetch('http://do/', {
    method: 'POST',
    body: JSON.stringify(op)
  })
  return response.json()
}

// Hono App
const app = new Hono<{ Bindings: Env }>()

app.use('*', cors())

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'Mongoose.do + MongoDB.do Demo',
    description: 'MongoDB-compatible ODM on Cloudflare Durable Objects',
    status: 'running',
    endpoints: {
      posts: '/api/posts',
      users: '/api/users'
    }
  })
})

// Posts CRUD
app.get('/api/posts', async (c) => {
  const status = c.req.query('status')
  const limit = parseInt(c.req.query('limit') || '10')
  const filter: any = {}
  if (status) filter.status = status

  const result = await db(c.env, {
    method: 'find',
    collection: 'posts',
    filter,
    options: { limit, sort: { createdAt: -1 } }
  })
  return c.json(result)
})

app.post('/api/posts', async (c) => {
  const data = await c.req.json<Partial<Post>>()
  if (!data.title) {
    return c.json({ error: 'title is required' }, 400)
  }

  const result = await db(c.env, {
    method: 'insertOne',
    collection: 'posts',
    data: { ...data, status: data.status || 'draft' }
  })
  return c.json(result, 201)
})

app.get('/api/posts/:id', async (c) => {
  const id = c.req.param('id')
  const result = await db(c.env, {
    method: 'findOne',
    collection: 'posts',
    filter: { _id: id }
  })
  if (!result.doc) {
    return c.json({ error: 'Post not found' }, 404)
  }
  return c.json(result.doc)
})

app.patch('/api/posts/:id', async (c) => {
  const id = c.req.param('id')
  const data = await c.req.json()
  const result = await db(c.env, {
    method: 'updateOne',
    collection: 'posts',
    filter: { _id: id },
    data: { $set: data }
  })
  if (result.modifiedCount === 0) {
    return c.json({ error: 'Post not found' }, 404)
  }
  return c.json(result.doc)
})

app.delete('/api/posts/:id', async (c) => {
  const id = c.req.param('id')
  const result = await db(c.env, {
    method: 'deleteOne',
    collection: 'posts',
    filter: { _id: id }
  })
  if (result.deletedCount === 0) {
    return c.json({ error: 'Post not found' }, 404)
  }
  return c.json({ success: true })
})

// Users CRUD
app.get('/api/users', async (c) => {
  const result = await db(c.env, {
    method: 'find',
    collection: 'users',
    filter: {},
    options: { limit: 50 }
  })
  return c.json(result)
})

app.post('/api/users', async (c) => {
  const data = await c.req.json<Partial<User>>()
  if (!data.email) {
    return c.json({ error: 'email is required' }, 400)
  }

  const result = await db(c.env, {
    method: 'insertOne',
    collection: 'users',
    data: { ...data, role: data.role || 'user' }
  })
  return c.json(result, 201)
})

app.get('/api/users/:id', async (c) => {
  const id = c.req.param('id')
  const result = await db(c.env, {
    method: 'findOne',
    collection: 'users',
    filter: { _id: id }
  })
  if (!result.doc) {
    return c.json({ error: 'User not found' }, 404)
  }
  return c.json(result.doc)
})

// Stats
app.get('/api/stats', async (c) => {
  const [posts, users] = await Promise.all([
    db(c.env, { method: 'countDocuments', collection: 'posts', filter: {} }),
    db(c.env, { method: 'countDocuments', collection: 'users', filter: {} })
  ])

  const published = await db(c.env, {
    method: 'countDocuments',
    collection: 'posts',
    filter: { status: 'published' }
  })

  return c.json({
    posts: { total: posts.count, published: published.count, draft: posts.count - published.count },
    users: { total: users.count }
  })
})

export default app
