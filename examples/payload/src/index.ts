/**
 * Payload CMS on Cloudflare Workers
 *
 * This example demonstrates running Payload CMS with mondoo/mondodb
 * on Cloudflare Workers with Durable Objects as the database.
 */

import { Hono } from 'hono'
import { getPayload } from 'payload'
import config from './payload.config'

// Re-export the MongoDB Durable Object from mondodb
export { MongoDBDurableObject } from 'mondodb'

interface Env {
  MONGODB: DurableObjectNamespace
  PAYLOAD_SECRET?: string
}

const app = new Hono<{ Bindings: Env }>()

// Initialize Payload once per isolate
let payloadPromise: Promise<any> | null = null

async function getPayloadInstance(env: Env) {
  if (!payloadPromise) {
    payloadPromise = getPayload({ config })
  }
  return payloadPromise
}

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'Payload CMS on Cloudflare Workers',
    status: 'running',
    database: 'mondoo + mondodb (Durable Objects)',
  })
})

// Posts API
app.get('/api/posts', async (c) => {
  const payload = await getPayloadInstance(c.env)
  const result = await payload.find({
    collection: 'posts',
    limit: 10,
    req: { context: { env: c.env } },
  })
  return c.json(result)
})

app.post('/api/posts', async (c) => {
  const payload = await getPayloadInstance(c.env)
  const data = await c.req.json()
  const doc = await payload.create({
    collection: 'posts',
    data,
    req: { context: { env: c.env } },
  })
  return c.json(doc, 201)
})

app.get('/api/posts/:id', async (c) => {
  const payload = await getPayloadInstance(c.env)
  const doc = await payload.findByID({
    collection: 'posts',
    id: c.req.param('id'),
    req: { context: { env: c.env } },
  })
  return c.json(doc)
})

app.patch('/api/posts/:id', async (c) => {
  const payload = await getPayloadInstance(c.env)
  const data = await c.req.json()
  const doc = await payload.update({
    collection: 'posts',
    id: c.req.param('id'),
    data,
    req: { context: { env: c.env } },
  })
  return c.json(doc)
})

app.delete('/api/posts/:id', async (c) => {
  const payload = await getPayloadInstance(c.env)
  const doc = await payload.delete({
    collection: 'posts',
    id: c.req.param('id'),
    req: { context: { env: c.env } },
  })
  return c.json(doc)
})

// Users API
app.get('/api/users', async (c) => {
  const payload = await getPayloadInstance(c.env)
  const result = await payload.find({
    collection: 'users',
    limit: 10,
    req: { context: { env: c.env } },
  })
  return c.json(result)
})

app.post('/api/users', async (c) => {
  const payload = await getPayloadInstance(c.env)
  const data = await c.req.json()
  const doc = await payload.create({
    collection: 'users',
    data,
    req: { context: { env: c.env } },
  })
  return c.json(doc, 201)
})

export default app
