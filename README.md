# mongoose.do

[![npm version](https://img.shields.io/npm/v/mongoose.do.svg)](https://www.npmjs.com/package/mongoose.do)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

**The Mongoose API you know and love, built for Cloudflare Durable Objects.**

mongoose.do is a Mongoose-compatible ODM that brings the familiar Mongoose developer experience to Cloudflare Workers and Durable Objects. Write schemas, models, and queries exactly like Mongoose, but run them on the edge.

## Why mongoose.do?

- **Familiar API** - Same Schema, Model, and Query patterns from Mongoose
- **Edge-Native** - Built specifically for Cloudflare Workers + Durable Objects
- **TypeScript-First** - Full type inference with the modern `$` API
- **Zero Cold Start Overhead** - No connection pooling, no MongoDB Atlas needed
- **Drop-in Migration** - Move existing Mongoose code to the edge with minimal changes

## Installation

```bash
npm install mongoose.do mongo.do
```

`mongo.do` is the peer dependency that provides the MongoDB-compatible storage layer on Durable Objects.

## Quick Start

### Define Schemas with the `$` API (Recommended)

The `$` API provides a modern, Zod-inspired approach with automatic TypeScript inference:

```typescript
import { $, model, createMongoose } from 'mongoose.do'

// Define schema with fluent, type-safe builders
const userSchema = $.schema({
  name: $.string().required(),
  email: $.string().email().required().unique(),
  age: $.number().min(0).max(150),
  role: $.enum(['admin', 'user', 'guest']).default('user'),
  posts: $.array($.objectId().ref('Post'))
})

// Automatic type inference - no manual interface needed!
type User = $.infer<typeof userSchema>

// Create the model
const User = model<User>('User', userSchema)
```

### Or Use Classic Mongoose Syntax

Perfect for migrating existing Mongoose codebases:

```typescript
import { Schema, model } from 'mongoose.do'

const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  age: { type: Number, min: 0, max: 150 },
  role: { type: String, enum: ['admin', 'user', 'guest'], default: 'user' },
  posts: [{ type: 'ObjectId', ref: 'Post' }]
}, {
  timestamps: true
})

const User = model('User', userSchema)
```

### Use in Cloudflare Workers

```typescript
// worker.ts
import { createMongoose } from 'mongoose.do'
import { userSchema, postSchema } from './schemas'

interface Env {
  MONGODB: DurableObjectNamespace
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const mongoose = createMongoose(env)

    const User = mongoose.model('User', userSchema)
    const Post = mongoose.model('Post', postSchema)

    // Full Mongoose query API
    const admins = await User
      .find({ role: 'admin' })
      .select('name email')
      .sort({ createdAt: -1 })
      .limit(10)

    return Response.json(admins)
  }
}
```

## CRUD Operations

```typescript
// Create
const user = await User.create({
  name: 'Jane Doe',
  email: 'jane@example.com',
  age: 28
})

// Read
const users = await User.find({ age: { $gte: 18 } })
const user = await User.findById('507f1f77bcf86cd799439011')
const admin = await User.findOne({ role: 'admin' })

// Update
await User.updateOne(
  { email: 'jane@example.com' },
  { $set: { name: 'Jane Smith' } }
)

const updated = await User.findByIdAndUpdate(
  userId,
  { $inc: { loginCount: 1 } },
  { new: true }
)

// Delete
await User.deleteOne({ email: 'jane@example.com' })
await User.findByIdAndDelete(userId)
```

## The `$` API - TypeScript Superpowers

The `$` namespace provides a Zod-like experience with full type inference:

### Type Builders

```typescript
// Primitives
$.string()              // String with validations
$.number()              // Number with min/max/int
$.boolean()             // Boolean
$.date()                // Date with range validation
$.objectId()            // MongoDB ObjectId with refs
$.bigint()              // BigInt support
$.buffer()              // Binary data

// Complex Types
$.array($.string())     // Typed arrays
$.object({ ... })       // Nested objects
$.map($.number())       // Key-value maps
$.enum(['a', 'b'])      // String enums
$.literal('active')     // Literal values
$.mixed()               // Any type (escape hatch)
```

### Chainable Validators

```typescript
const userSchema = $.schema({
  // String validations
  email: $.string().email().required().unique(),
  username: $.string().min(3).max(20).trim().lowercase(),
  website: $.string().url(),

  // Number validations
  age: $.number().min(13).max(120).int(),
  score: $.number().positive().finite(),

  // Array validations
  tags: $.array($.string()).min(1).max(10),

  // References
  author: $.objectId().ref('User').required(),
  followers: $.array($.objectId().ref('User')),

  // Nested objects
  profile: $.object({
    bio: $.string().max(500),
    avatar: $.string().url(),
    social: $.map($.string().url())
  }),

  // Custom validation
  customField: $.string().validate(v => v.startsWith('prefix_'))
})

// Type is automatically inferred
type User = $.infer<typeof userSchema>
```

## Query Builder

Full chainable query API matching Mongoose:

```typescript
const results = await User
  .find()
  .where('age').gte(18).lte(65)
  .where('status').equals('active')
  .where('role').in(['user', 'admin'])
  .select('name email age')
  .sort({ createdAt: -1 })
  .skip(20)
  .limit(10)
  .lean()
```

### Population

```typescript
const posts = await Post
  .find({ status: 'published' })
  .populate('author', 'name avatar')
  .populate({
    path: 'comments',
    match: { approved: true },
    populate: { path: 'user', select: 'name' }
  })
  .sort({ publishedAt: -1 })
```

### Aggregation Pipeline

```typescript
const stats = await User.aggregate()
  .match({ status: 'active' })
  .group({
    _id: '$role',
    count: { $sum: 1 },
    avgAge: { $avg: '$age' }
  })
  .sort({ count: -1 })
```

## Schema Features

### Virtuals

```typescript
userSchema.virtual('fullName')
  .get(function() {
    return `${this.firstName} ${this.lastName}`
  })
  .set(function(value) {
    const [first, ...rest] = value.split(' ')
    this.firstName = first
    this.lastName = rest.join(' ')
  })
```

### Instance Methods

```typescript
userSchema.method('comparePassword', async function(candidate: string) {
  return await bcrypt.compare(candidate, this.password)
})

// Usage
const isValid = await user.comparePassword('secret123')
```

### Static Methods

```typescript
userSchema.static('findByEmail', function(email: string) {
  return this.findOne({ email })
})

// Usage
const user = await User.findByEmail('jane@example.com')
```

### Middleware Hooks

```typescript
userSchema.pre('save', function(next) {
  this.updatedAt = new Date()
  next()
})

userSchema.post('save', function(doc) {
  console.log(`User ${doc.name} saved`)
})
```

## Wrangler Configuration

```toml
# wrangler.toml
name = "my-app"
main = "src/worker.ts"

[[durable_objects.bindings]]
name = "MONGODB"
class_name = "MongoDB"

[[migrations]]
tag = "v1"
new_classes = ["MongoDB"]
```

## Documentation

- [Getting Started](./content/docs/getting-started.mdx)
- [$ API Reference](./content/docs/dollar-api.mdx)
- [Schema Guide](./content/docs/schema.mdx)
- [Model Operations](./content/docs/model.mdx)
- [Query Builder](./content/docs/query.mdx)
- [Population](./content/docs/population.mdx)
- [Middleware](./content/docs/middleware.mdx)
- [Connection](./content/docs/connection.mdx)

## API Compatibility

mongoose.do implements the core Mongoose API surface:

| Feature | Status |
|---------|--------|
| Schema Definition | Full |
| Type Coercion | Full |
| Validation | Full |
| Virtuals | Full |
| Instance Methods | Full |
| Static Methods | Full |
| Middleware/Hooks | Full |
| Population | Full |
| Query Builder | Full |
| Aggregation | Full |
| Discriminators | Full |
| Transactions | Partial |

## TypeScript

mongoose.do is written in TypeScript and provides first-class type support:

```typescript
import { $, model, Document } from 'mongoose.do'

const userSchema = $.schema({
  name: $.string().required(),
  email: $.string().email().required(),
  age: $.number()
})

type User = $.infer<typeof userSchema>

const User = model<User>('User', userSchema)

// Full type safety
const user = await User.findById(id)
if (user) {
  user.name   // string
  user.email  // string
  user.age    // number | undefined
}
```

## Related Packages

- [mongo.do](https://github.com/dot-do/mongo) - MongoDB-compatible API for Durable Objects
- [payload.do](https://github.com/dot-do/payload) - Payload CMS adapter for Cloudflare Workers

## License

MIT
