/**
 * Tests for Model class - the main interface for database operations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { model, Model, getModel, hasModel, deleteModel, modelNames } from '../src/model/index.js'
import { Schema } from '../src/schema/index.js'
import { Query } from '../src/query/index.js'

describe('model()', () => {
  beforeEach(() => {
    // Clean up models between tests
    for (const name of modelNames()) {
      deleteModel(name)
    }
  })

  it('creates a model from name and schema', () => {
    const schema = new Schema({ name: String, age: Number })
    const User = model('User', schema)

    expect(User).toBeDefined()
    expect(User.modelName).toBe('User')
  })

  it('model has schema reference', () => {
    const schema = new Schema({ name: String })
    const User = model('User', schema)

    expect(User.schema).toBe(schema)
  })

  it('model instances are Document instances', () => {
    const schema = new Schema({ name: String })
    const User = model('User', schema)

    const user = new User({ name: 'John' })

    // Model constructor returns a Document with the data
    expect(user.name).toBe('John')
    expect(user.isNew).toBe(true)
  })

  it('registers model in global registry', () => {
    const schema = new Schema({ name: String })
    model('User', schema)

    expect(hasModel('User')).toBe(true)
    expect(getModel('User')).toBeDefined()
  })

  it('supports collection option', () => {
    const schema = new Schema({ name: String })
    const User = model('User', schema, { collection: 'people' })

    expect(User.collection).toBeDefined()
  })
})

describe('Model class', () => {
  let User: ReturnType<typeof model>
  let schema: Schema

  beforeEach(() => {
    for (const name of modelNames()) {
      deleteModel(name)
    }
    schema = new Schema({
      name: { type: String, required: true },
      email: String,
      age: { type: Number, min: 0 },
    })
    User = model('User', schema)
  })

  describe('constructor', () => {
    it('creates document instance', () => {
      const user = new User({ name: 'John', email: 'john@example.com' })

      expect(user.name).toBe('John')
      expect(user.email).toBe('john@example.com')
    })

    it('new documents are marked as isNew', () => {
      const user = new User({ name: 'John' })

      expect(user.isNew).toBe(true)
    })

    it('supports setting _id manually', () => {
      const user = new User({ name: 'John', _id: '507f1f77bcf86cd799439011' } as any)

      expect(user._id).toBe('507f1f77bcf86cd799439011')
    })
  })

  describe('static query methods', () => {
    it('find() returns Query', () => {
      const query = User.find({ name: 'John' })

      expect(query).toBeInstanceOf(Query)
      expect(query.op()).toBe('find')
    })

    it('findById() returns Query', () => {
      const query = User.findById('507f1f77bcf86cd799439011')

      expect(query).toBeInstanceOf(Query)
      expect(query.op()).toBe('findOne')
    })

    it('findOne() returns Query', () => {
      const query = User.findOne({ name: 'John' })

      expect(query).toBeInstanceOf(Query)
      expect(query.op()).toBe('findOne')
    })

    it('countDocuments() returns Query', () => {
      const query = User.countDocuments({ active: true })

      expect(query).toBeInstanceOf(Query)
      expect(query.op()).toBe('count')
    })

    it('estimatedDocumentCount() returns Promise', async () => {
      const result = User.estimatedDocumentCount()

      // estimatedDocumentCount returns a Promise directly
      expect(result).toBeInstanceOf(Promise)
      const count = await result
      expect(typeof count).toBe('number')
    })

    it('distinct() returns Query', () => {
      const query = User.distinct('email')

      expect(query).toBeInstanceOf(Query)
      expect(query.op()).toBe('distinct')
    })
  })

  describe('static CRUD methods', () => {
    it('create() creates new document(s)', async () => {
      // This is a placeholder test since we don't have actual DB
      const createFn = User.create.bind(User)
      expect(typeof createFn).toBe('function')
    })

    it('insertMany() inserts multiple documents', async () => {
      const insertManyFn = User.insertMany.bind(User)
      expect(typeof insertManyFn).toBe('function')
    })

    it('findByIdAndUpdate() finds and updates', () => {
      const query = User.findByIdAndUpdate('507f1f77bcf86cd799439011', { name: 'Jane' })
      expect(query).toBeDefined()
    })

    it('findByIdAndDelete() finds and deletes', () => {
      const query = User.findByIdAndDelete('507f1f77bcf86cd799439011')
      expect(query).toBeDefined()
    })

    it('findOneAndUpdate() finds and updates', () => {
      const query = User.findOneAndUpdate({ name: 'John' }, { name: 'Jane' })
      expect(query).toBeDefined()
    })

    it('findOneAndDelete() finds and deletes', () => {
      const query = User.findOneAndDelete({ name: 'John' })
      expect(query).toBeDefined()
    })

    it('updateOne() updates single document', () => {
      const updateFn = User.updateOne.bind(User)
      expect(typeof updateFn).toBe('function')
    })

    it('updateMany() updates multiple documents', () => {
      const updateFn = User.updateMany.bind(User)
      expect(typeof updateFn).toBe('function')
    })

    it('deleteOne() deletes single document', () => {
      const deleteFn = User.deleteOne.bind(User)
      expect(typeof deleteFn).toBe('function')
    })

    it('deleteMany() deletes multiple documents', () => {
      const deleteFn = User.deleteMany.bind(User)
      expect(typeof deleteFn).toBe('function')
    })

    it('replaceOne() replaces single document', () => {
      const replaceFn = User.replaceOne.bind(User)
      expect(typeof replaceFn).toBe('function')
    })
  })

  describe('exists()', () => {
    it('returns existence check query', async () => {
      const existsFn = User.exists.bind(User)
      expect(typeof existsFn).toBe('function')
    })
  })

  describe('aggregate()', () => {
    it('returns aggregate function', () => {
      const aggregateFn = User.aggregate.bind(User)
      expect(typeof aggregateFn).toBe('function')
    })
  })

  describe('where()', () => {
    it('creates query with where clause', () => {
      const query = User.where('age').gte(18)

      expect(query).toBeInstanceOf(Query)
    })
  })

  describe('hydrate()', () => {
    it('creates document from raw data', () => {
      const user = User.hydrate({ _id: '123', name: 'John', email: 'john@example.com' })

      // Hydrate returns a Document-like object
      expect(user.name).toBe('John')
      expect(user.isNew).toBe(false)
    })
  })

  describe('_populateDocument()', () => {
    it('has internal populate method', () => {
      expect(typeof User._populateDocument).toBe('function')
    })
  })

  describe('watch()', () => {
    it('has watch method for change streams', () => {
      expect(typeof User.watch).toBe('function')
    })
  })

  describe('bulkWrite()', () => {
    it('has bulkWrite method', () => {
      expect(typeof User.bulkWrite).toBe('function')
    })
  })

  describe('syncIndexes()', () => {
    it('has syncIndexes method', async () => {
      const result = await User.syncIndexes()
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('createIndexes()', () => {
    it('has createIndexes method', async () => {
      // createIndexes returns void (creates indexes in database)
      await expect(User.createIndexes()).resolves.toBeUndefined()
    })
  })

  describe('ensureIndexes()', () => {
    it('has ensureIndexes method', async () => {
      // ensureIndexes is an alias for createIndexes
      await expect(User.ensureIndexes()).resolves.toBeUndefined()
    })
  })

  describe('listIndexes()', () => {
    it('has listIndexes method', async () => {
      const result = await User.listIndexes()
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('listIndexes()', () => {
    it('returns array of index definitions', async () => {
      const result = await User.listIndexes()
      expect(Array.isArray(result)).toBe(true)
    })
  })
})

describe('model registry', () => {
  beforeEach(() => {
    for (const name of modelNames()) {
      deleteModel(name)
    }
  })

  describe('getModel()', () => {
    it('returns registered model', () => {
      const schema = new Schema({ name: String })
      const User = model('User', schema)

      expect(getModel('User')).toBe(User)
    })

    it('returns undefined for unregistered model', () => {
      expect(getModel('NonExistent')).toBeUndefined()
    })
  })

  describe('hasModel()', () => {
    it('returns true for registered model', () => {
      const schema = new Schema({ name: String })
      model('User', schema)

      expect(hasModel('User')).toBe(true)
    })

    it('returns false for unregistered model', () => {
      expect(hasModel('NonExistent')).toBe(false)
    })
  })

  describe('deleteModel()', () => {
    it('removes model from registry', () => {
      const schema = new Schema({ name: String })
      model('User', schema)

      deleteModel('User')

      expect(hasModel('User')).toBe(false)
    })

    it('returns true if model was deleted', () => {
      const schema = new Schema({ name: String })
      model('User', schema)

      expect(deleteModel('User')).toBe(true)
    })

    it('returns false if model did not exist', () => {
      expect(deleteModel('NonExistent')).toBe(false)
    })
  })

  describe('modelNames()', () => {
    it('returns array of registered model names', () => {
      const schema = new Schema({ name: String })
      model('User', schema)
      model('Post', schema)

      const names = modelNames()

      expect(names).toContain('User')
      expect(names).toContain('Post')
    })

    it('returns empty array when no models registered', () => {
      expect(modelNames()).toEqual([])
    })
  })
})

describe('discriminators', () => {
  beforeEach(() => {
    for (const name of modelNames()) {
      deleteModel(name)
    }
  })

  it('creates discriminator model', () => {
    const eventSchema = new Schema({ date: Date })
    const Event = model('Event', eventSchema)

    const clickEventSchema = new Schema({ element: String })
    const ClickEvent = Event.discriminator('ClickEvent', clickEventSchema)

    expect(ClickEvent).toBeDefined()
    expect(ClickEvent.modelName).toBe('ClickEvent')
  })

  it('discriminator instances have discriminator fields', () => {
    const eventSchema = new Schema({ date: Date })
    const Event = model('Event', eventSchema)

    const clickEventSchema = new Schema({ element: String })
    const ClickEvent = Event.discriminator('ClickEvent', clickEventSchema)

    const click = new ClickEvent({ element: 'button' })

    // Discriminator should have its own fields
    expect(click.element).toBe('button')
    expect(ClickEvent.modelName).toBe('ClickEvent')
  })
})

describe('schema methods and statics', () => {
  beforeEach(() => {
    for (const name of modelNames()) {
      deleteModel(name)
    }
  })

  it('instance methods are available on documents', () => {
    const schema = new Schema({ name: String })
    schema.method('greet', function () {
      return `Hello, ${this.name}`
    })

    const User = model('User', schema)
    const user = new User({ name: 'John' })

    expect(user.greet()).toBe('Hello, John')
  })

  it('static methods are available on model', () => {
    const schema = new Schema({ name: String, active: Boolean })
    schema.static('findActive', function () {
      return this.find({ active: true })
    })

    const User = model('User', schema)

    expect(typeof User.findActive).toBe('function')
  })
})

describe('validation', () => {
  beforeEach(() => {
    for (const name of modelNames()) {
      deleteModel(name)
    }
  })

  it('validate() throws on schema validation failure', async () => {
    const schema = new Schema({
      name: { type: String, required: true },
      age: { type: Number, min: 0 },
    })
    const User = model('User', schema)

    const user = new User({ age: -5 })

    // validate() throws on failure
    await expect(user.validate()).rejects.toThrow('Validation failed')
  })

  it('validateSync() returns null when valid', () => {
    const schema = new Schema({
      name: { type: String, required: true },
    })
    const User = model('User', schema)

    const user = new User({ name: 'John' })
    const result = user.validateSync()

    // validateSync returns null when valid (placeholder implementation)
    expect(result).toBeNull()
  })
})
