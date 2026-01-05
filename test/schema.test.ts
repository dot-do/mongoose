/**
 * Tests for Schema class - Mongoose-compatible schema definition
 */
import { describe, it, expect, vi } from 'vitest'
import { Schema, Types } from '../src/schema/index.js'
import { $ } from '../src/$.js'

describe('Schema', () => {
  describe('constructor', () => {
    it('creates a schema with Mongoose-style definition', () => {
      const schema = new Schema({
        name: { type: String, required: true },
        age: { type: Number, min: 0 },
        email: String,
      })

      expect(schema).toBeInstanceOf(Schema)
    })

    it('creates a schema with options', () => {
      const schema = new Schema(
        { name: String },
        {
          timestamps: true,
          versionKey: '__v',
          strict: true,
        }
      )

      expect(schema.options.timestamps).toBe(true)
      expect(schema.options.versionKey).toBe('__v')
      expect(schema.options.strict).toBe(true)
    })

    it('creates a schema with collection option', () => {
      const schema = new Schema({ name: String }, { collection: 'custom_users' })

      expect(schema.options.collection).toBe('custom_users')
    })
  })

  describe('Schema.fromZodStyle', () => {
    it('creates schema from $ API shape', () => {
      const schema = Schema.fromZodStyle({
        name: $.string().required(),
        age: $.number().min(0),
      })

      expect(schema).toBeInstanceOf(Schema)
    })
  })

  describe('path()', () => {
    it('returns schema type for a path', () => {
      const schema = new Schema({
        name: { type: String, required: true },
        profile: {
          bio: String,
          avatar: String,
        },
      })

      const nameType = schema.path('name')
      expect(nameType).toBeDefined()

      // Nested objects are stored as ObjectType at the parent path
      const profileType = schema.path('profile')
      expect(profileType).toBeDefined()
    })

    it('returns undefined for non-existent path', () => {
      const schema = new Schema({ name: String })

      expect(schema.path('nonexistent')).toBeUndefined()
    })
  })

  describe('add()', () => {
    it('adds paths to existing schema', () => {
      const schema = new Schema({ name: String })

      schema.add({ age: Number, email: String })

      expect(schema.path('age')).toBeDefined()
      expect(schema.path('email')).toBeDefined()
    })

    it('supports prefix for nested paths', () => {
      const schema = new Schema({ user: {} })

      schema.add({ name: String, age: Number }, 'user.')

      expect(schema.path('user.name')).toBeDefined()
      expect(schema.path('user.age')).toBeDefined()
    })
  })

  describe('methods', () => {
    it('defines instance methods via method()', () => {
      const schema = new Schema({ name: String })

      schema.method('getFullName', function () {
        return `Full: ${this.name}`
      })

      expect(schema.methods.getFullName).toBeDefined()
    })

    it('method() adds a single method', () => {
      const schema = new Schema({ name: String })

      schema.method('greet', function () {
        return `Hello, ${this.name}`
      })

      expect(schema.methods.greet).toBeDefined()
    })

    it('method() adds multiple methods from object', () => {
      const schema = new Schema({ name: String })

      schema.method({
        greet() {
          return `Hello`
        },
        farewell() {
          return `Goodbye`
        },
      })

      expect(schema.methods.greet).toBeDefined()
      expect(schema.methods.farewell).toBeDefined()
    })
  })

  describe('statics', () => {
    it('defines static methods via static()', () => {
      const schema = new Schema({ name: String })

      schema.static('findByName', function (name: string) {
        return this.find({ name })
      })

      expect(schema.statics.findByName).toBeDefined()
    })

    it('static() adds a single static method', () => {
      const schema = new Schema({ name: String })

      schema.static('findActive', function () {
        return this.find({ active: true })
      })

      expect(schema.statics.findActive).toBeDefined()
    })
  })

  describe('virtuals', () => {
    it('defines a virtual property', () => {
      const schema = new Schema({
        firstName: String,
        lastName: String,
      })

      schema
        .virtual('fullName')
        .get(function () {
          return `${this.firstName} ${this.lastName}`
        })
        .set(function (value: string) {
          const parts = value.split(' ')
          this.firstName = parts[0]
          this.lastName = parts[1]
        })

      const virtuals = schema.virtuals()
      expect(virtuals.has('fullName')).toBe(true)
    })

    it('supports virtual population options', () => {
      const schema = new Schema({ name: String })

      schema.virtual('posts', {
        ref: 'Post',
        localField: '_id',
        foreignField: 'author',
      })

      const virtuals = schema.virtuals()
      const postsVirtual = virtuals.get('posts')
      expect(postsVirtual?.options?.ref).toBe('Post')
      expect(postsVirtual?.options?.localField).toBe('_id')
      expect(postsVirtual?.options?.foreignField).toBe('author')
    })
  })

  describe('hooks (pre/post)', () => {
    it('registers pre hook', () => {
      const schema = new Schema({ name: String })

      const hookFn = vi.fn()
      schema.pre('save', hookFn)

      const hooks = schema.getPreHooks('save')
      expect(hooks.length).toBe(1)
    })

    it('registers post hook', () => {
      const schema = new Schema({ name: String })

      const hookFn = vi.fn()
      schema.post('save', hookFn)

      const hooks = schema.getPostHooks('save')
      expect(hooks.length).toBe(1)
    })

    it('supports multiple hooks for same event', () => {
      const schema = new Schema({ name: String })

      schema.pre('save', vi.fn())
      schema.pre('save', vi.fn())
      schema.pre('save', vi.fn())

      const hooks = schema.getPreHooks('save')
      expect(hooks.length).toBe(3)
    })

    it('supports query hooks', () => {
      const schema = new Schema({ name: String })

      schema.pre('find', function () {
        // Query hook
      })

      const hooks = schema.getPreHooks('find')
      expect(hooks.length).toBe(1)
    })
  })

  describe('indexes', () => {
    it('defines indexes with index()', () => {
      const schema = new Schema({ name: String, email: String })

      schema.index({ email: 1 }, { unique: true })

      const indexes = schema.indexes()
      expect(indexes.length).toBe(1)
      expect(indexes[0]).toEqual([{ email: 1 }, { unique: true }])
    })

    it('supports compound indexes', () => {
      const schema = new Schema({ name: String, email: String })

      schema.index({ name: 1, email: 1 })

      const indexes = schema.indexes()
      expect(indexes.length).toBe(1)
    })
  })

  describe('plugins', () => {
    it('applies plugins with plugin()', () => {
      const schema = new Schema({ name: String })

      const pluginFn = vi.fn()
      schema.plugin(pluginFn, { option: 'value' })

      expect(pluginFn).toHaveBeenCalledWith(schema, { option: 'value' })
    })
  })

  describe('clone()', () => {
    it('creates a deep copy of the schema', () => {
      const schema = new Schema({ name: String })
      schema.pre('save', vi.fn())
      schema.index({ name: 1 })

      const cloned = schema.clone()

      expect(cloned).not.toBe(schema)
      expect(cloned.path('name')).toBeDefined()
      expect(cloned.getPreHooks('save').length).toBe(1)
      expect(cloned.indexes().length).toBe(1)
    })
  })

  describe('paths()', () => {
    it('returns all defined paths', () => {
      const schema = new Schema({
        name: String,
        age: Number,
        email: String,
      })

      const paths = schema.paths()
      expect(paths.has('name')).toBe(true)
      expect(paths.has('age')).toBe(true)
      expect(paths.has('email')).toBe(true)
    })
  })

  describe('eachPath()', () => {
    it('iterates over all paths', () => {
      const schema = new Schema({
        name: String,
        age: Number,
      })

      const visited: string[] = []
      schema.eachPath((path) => {
        visited.push(path)
      })

      expect(visited).toContain('name')
      expect(visited).toContain('age')
    })
  })

  describe('obj getter', () => {
    it('returns the original definition', () => {
      const definition = { name: String, age: Number }
      const schema = new Schema(definition)

      expect(schema.obj).toEqual(definition)
    })
  })
})

describe('Types', () => {
  it('provides type constructors', () => {
    expect(Types.String).toBeDefined()
    expect(Types.Number).toBeDefined()
    expect(Types.Boolean).toBeDefined()
    expect(Types.Date).toBeDefined()
    expect(Types.ObjectId).toBeDefined()
    expect(Types.Array).toBeDefined()
    expect(Types.Mixed).toBeDefined()
    expect(Types.Buffer).toBeDefined()
    expect(Types.Map).toBeDefined()
  })
})
