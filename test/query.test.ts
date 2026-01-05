/**
 * Tests for Query class - chainable query builder
 */
import { describe, it, expect, vi } from 'vitest'
import { Query, QueryCursor } from '../src/query/index.js'

describe('Query', () => {
  // Mock model for testing
  const mockModel = {
    collection: {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      countDocuments: vi.fn().mockResolvedValue(0),
      estimatedDocumentCount: vi.fn().mockResolvedValue(0),
      distinct: vi.fn().mockResolvedValue([]),
    },
    modelName: 'TestModel',
  }

  describe('static factory methods', () => {
    it('Query.find() creates a find query', () => {
      const query = Query.find(mockModel, { name: 'John' })

      expect(query.op()).toBe('find')
      expect(query.getFilter()).toEqual({ name: 'John' })
    })

    it('Query.findOne() creates a findOne query', () => {
      const query = Query.findOne(mockModel, { name: 'John' })

      expect(query.op()).toBe('findOne')
    })

    it('Query.countDocuments() creates a count query', () => {
      const query = Query.countDocuments(mockModel, { active: true })

      expect(query.op()).toBe('countDocuments')
    })

    it('Query.estimatedDocumentCount() creates an estimated count query', () => {
      const query = Query.estimatedDocumentCount(mockModel)

      expect(query.op()).toBe('estimatedDocumentCount')
    })

    it('Query.distinct() creates a distinct query', () => {
      const query = Query.distinct(mockModel, 'status', { active: true })

      expect(query.op()).toBe('distinct')
    })
  })

  describe('where() and chained conditions', () => {
    it('where() with path and value', () => {
      const query = Query.find(mockModel).where('name', 'John')

      expect(query.getFilter()).toEqual({ name: 'John' })
    })

    it('where() with object', () => {
      const query = Query.find(mockModel).where({ name: 'John', age: 30 })

      expect(query.getFilter()).toEqual({ name: 'John', age: 30 })
    })

    it('where() then equals()', () => {
      const query = Query.find(mockModel).where('name').equals('John')

      expect(query.getFilter()).toEqual({ name: { $eq: 'John' } })
    })

    it('where() then gt()', () => {
      const query = Query.find(mockModel).where('age').gt(18)

      expect(query.getFilter()).toEqual({ age: { $gt: 18 } })
    })

    it('where() then gte()', () => {
      const query = Query.find(mockModel).where('age').gte(18)

      expect(query.getFilter()).toEqual({ age: { $gte: 18 } })
    })

    it('where() then lt()', () => {
      const query = Query.find(mockModel).where('age').lt(65)

      expect(query.getFilter()).toEqual({ age: { $lt: 65 } })
    })

    it('where() then lte()', () => {
      const query = Query.find(mockModel).where('age').lte(65)

      expect(query.getFilter()).toEqual({ age: { $lte: 65 } })
    })

    it('where() then ne()', () => {
      const query = Query.find(mockModel).where('status').ne('deleted')

      expect(query.getFilter()).toEqual({ status: { $ne: 'deleted' } })
    })

    it('where() then in()', () => {
      const query = Query.find(mockModel).where('role').in(['admin', 'user'])

      expect(query.getFilter()).toEqual({ role: { $in: ['admin', 'user'] } })
    })

    it('where() then nin()', () => {
      const query = Query.find(mockModel).where('role').nin(['banned'])

      expect(query.getFilter()).toEqual({ role: { $nin: ['banned'] } })
    })

    it('where() then exists()', () => {
      const query = Query.find(mockModel).where('email').exists(true)

      expect(query.getFilter()).toEqual({ email: { $exists: true } })
    })

    it('where() then regex()', () => {
      const query = Query.find(mockModel).where('name').regex(/^J/)

      expect(query.getFilter()).toEqual({ name: { $regex: /^J/ } })
    })

    it('multiple conditions on same path', () => {
      const query = Query.find(mockModel).where('age').gte(18).lte(65)

      expect(query.getFilter()).toEqual({ age: { $gte: 18, $lte: 65 } })
    })
  })

  describe('logical operators', () => {
    it('and() adds $and conditions', () => {
      const query = Query.find(mockModel).and([
        { age: { $gte: 18 } },
        { status: 'active' },
      ])

      expect(query.getFilter().$and).toEqual([
        { age: { $gte: 18 } },
        { status: 'active' },
      ])
    })

    it('or() adds $or conditions', () => {
      const query = Query.find(mockModel).or([
        { role: 'admin' },
        { role: 'superuser' },
      ])

      expect(query.getFilter().$or).toEqual([
        { role: 'admin' },
        { role: 'superuser' },
      ])
    })

    it('nor() adds $nor conditions', () => {
      const query = Query.find(mockModel).nor([{ deleted: true }])

      expect(query.getFilter().$nor).toEqual([{ deleted: true }])
    })
  })

  describe('select()', () => {
    it('select() with string', () => {
      const query = Query.find(mockModel).select('name email')

      expect(query.getProjection()).toEqual({ name: 1, email: 1 })
    })

    it('select() with exclusion string', () => {
      const query = Query.find(mockModel).select('-password -__v')

      expect(query.getProjection()).toEqual({ password: 0, __v: 0 })
    })

    it('select() with array', () => {
      const query = Query.find(mockModel).select(['name', 'email'])

      expect(query.getProjection()).toEqual({ name: 1, email: 1 })
    })

    it('select() with object', () => {
      const query = Query.find(mockModel).select({ name: 1, email: 1, password: 0 })

      expect(query.getProjection()).toEqual({ name: 1, email: 1, password: 0 })
    })
  })

  describe('sort()', () => {
    it('sort() with string', () => {
      const query = Query.find(mockModel).sort('name -createdAt')

      expect(query.getOptions().sort).toEqual({ name: 1, createdAt: -1 })
    })

    it('sort() with object', () => {
      const query = Query.find(mockModel).sort({ name: 1, createdAt: -1 })

      expect(query.getOptions().sort).toEqual({ name: 1, createdAt: -1 })
    })

    it('sort() with asc/desc strings', () => {
      const query = Query.find(mockModel).sort({ name: 'asc', createdAt: 'desc' })

      expect(query.getOptions().sort).toEqual({ name: 1, createdAt: -1 })
    })
  })

  describe('limit() and skip()', () => {
    it('limit() sets limit', () => {
      const query = Query.find(mockModel).limit(10)

      expect(query.getOptions().limit).toBe(10)
    })

    it('skip() sets skip', () => {
      const query = Query.find(mockModel).skip(20)

      expect(query.getOptions().skip).toBe(20)
    })

    it('pagination with skip and limit', () => {
      const query = Query.find(mockModel).skip(20).limit(10)

      expect(query.getOptions().skip).toBe(20)
      expect(query.getOptions().limit).toBe(10)
    })
  })

  describe('lean()', () => {
    it('lean() enables lean mode', () => {
      const query = Query.find(mockModel).lean()

      expect(query.getOptions().lean).toBe(true)
    })

    it('lean(false) disables lean mode', () => {
      const query = Query.find(mockModel).lean(false)

      expect(query.getOptions().lean).toBe(false)
    })
  })

  describe('populate()', () => {
    it('populate() with string path', () => {
      const query = Query.find(mockModel).populate('author')

      expect(query.getPopulate()).toEqual([{ path: 'author' }])
    })

    it('populate() with options object', () => {
      const query = Query.find(mockModel).populate({
        path: 'author',
        select: 'name email',
        model: 'User',
      })

      expect(query.getPopulate()).toEqual([
        { path: 'author', select: 'name email', model: 'User' },
      ])
    })

    it('populate() multiple paths', () => {
      const query = Query.find(mockModel).populate('author').populate('comments')

      expect(query.getPopulate()).toEqual([
        { path: 'author' },
        { path: 'comments' },
      ])
    })

    it('populate() with select', () => {
      const query = Query.find(mockModel).populate('author', 'name email')

      expect(query.getPopulate()).toEqual([
        { path: 'author', select: 'name email' },
      ])
    })
  })

  describe('other options', () => {
    it('session() sets session', () => {
      const session = { id: 'test-session' }
      const query = Query.find(mockModel).session(session)

      expect(query.getOptions().session).toBe(session)
    })

    it('batchSize() sets batch size', () => {
      const query = Query.find(mockModel).batchSize(100)

      expect(query.getOptions().batchSize).toBe(100)
    })

    it('hint() sets index hint', () => {
      const query = Query.find(mockModel).hint({ name: 1 })

      expect(query.getOptions().hint).toEqual({ name: 1 })
    })

    it('maxTimeMS() sets max execution time', () => {
      const query = Query.find(mockModel).maxTimeMS(5000)

      expect(query.getOptions().maxTimeMS).toBe(5000)
    })

    it('comment() adds query comment', () => {
      const query = Query.find(mockModel).comment('Find active users')

      expect(query.getOptions().comment).toBe('Find active users')
    })

    it('allowDiskUse() enables disk use', () => {
      const query = Query.find(mockModel).allowDiskUse(true)

      expect(query.getOptions().allowDiskUse).toBe(true)
    })
  })

  describe('query manipulation', () => {
    it('getFilter() returns current filter', () => {
      const query = Query.find(mockModel, { name: 'John' })

      expect(query.getFilter()).toEqual({ name: 'John' })
    })

    it('setQuery() replaces filter', () => {
      const query = Query.find(mockModel, { name: 'John' })

      query.setQuery({ name: 'Jane' })

      expect(query.getFilter()).toEqual({ name: 'Jane' })
    })

    it('merge() combines queries', () => {
      const query1 = Query.find(mockModel, { name: 'John' })
      const query2 = Query.find(mockModel, { age: 30 })

      query1.merge(query2)

      expect(query1.getFilter()).toEqual({ name: 'John', age: 30 })
    })

    it('clone() creates copy of query', () => {
      const query = Query.find(mockModel, { name: 'John' }).select('name').limit(10)

      const cloned = query.clone()

      expect(cloned).not.toBe(query)
      expect(cloned.getFilter()).toEqual({ name: 'John' })
      expect(cloned.getProjection()).toEqual({ name: 1 })
      expect(cloned.getOptions().limit).toBe(10)
    })

    it('setOptions() sets multiple options', () => {
      const query = Query.find(mockModel).setOptions({
        lean: true,
        limit: 10,
        skip: 20,
      })

      expect(query.getOptions().lean).toBe(true)
      expect(query.getOptions().limit).toBe(10)
      expect(query.getOptions().skip).toBe(20)
    })
  })

  describe('execution', () => {
    it('exec() executes the query', async () => {
      mockModel.collection.find.mockResolvedValue([{ name: 'John' }])

      const query = Query.find(mockModel)
      const result = await query.exec()

      expect(mockModel.collection.find).toHaveBeenCalled()
      expect(result).toEqual([{ name: 'John' }])
    })

    it('then() makes query thenable', async () => {
      mockModel.collection.find.mockResolvedValue([{ name: 'John' }])

      const query = Query.find(mockModel)
      const result = await query

      expect(result).toEqual([{ name: 'John' }])
    })

    it('toString() returns query representation', () => {
      const query = Query.find(mockModel, { name: 'John' })

      expect(query.toString()).toContain('find')
      expect(query.toString()).toContain('name')
    })
  })

  describe('countDocuments()', () => {
    it('returns count query from existing query', () => {
      const query = Query.find(mockModel, { active: true })

      const countQuery = query.countDocuments()

      expect(countQuery.op()).toBe('countDocuments')
      expect(countQuery.getFilter()).toEqual({ active: true })
    })
  })
})

describe('QueryCursor', () => {
  const mockQuery = {
    clone: () => ({
      exec: vi.fn().mockResolvedValue([{ name: 'John' }, { name: 'Jane' }]),
    }),
  } as any

  it('hasNext() returns true when documents available', async () => {
    const cursor = new QueryCursor(mockQuery)

    expect(await cursor.hasNext()).toBe(true)
  })

  it('next() returns next document', async () => {
    const cursor = new QueryCursor(mockQuery)

    const doc1 = await cursor.next()
    const doc2 = await cursor.next()

    expect(doc1).toEqual({ name: 'John' })
    expect(doc2).toEqual({ name: 'Jane' })
  })

  it('next() returns null when exhausted', async () => {
    const cursor = new QueryCursor(mockQuery)

    await cursor.next()
    await cursor.next()
    const doc3 = await cursor.next()

    expect(doc3).toBeNull()
  })

  it('toArray() returns all documents', async () => {
    const cursor = new QueryCursor(mockQuery)

    const docs = await cursor.toArray()

    expect(docs).toEqual([{ name: 'John' }, { name: 'Jane' }])
  })

  it('eachAsync() iterates over documents', async () => {
    const cursor = new QueryCursor(mockQuery)
    const visited: string[] = []

    await cursor.eachAsync((doc) => {
      visited.push(doc.name)
    })

    expect(visited).toEqual(['John', 'Jane'])
  })

  it('map() transforms documents', async () => {
    const cursor = new QueryCursor(mockQuery)

    const names = await cursor.map((doc) => doc.name)

    expect(names).toEqual(['John', 'Jane'])
  })

  it('rewind() resets cursor position', async () => {
    const cursor = new QueryCursor(mockQuery)

    await cursor.next()
    await cursor.next()
    cursor.rewind()

    const doc = await cursor.next()
    expect(doc).toEqual({ name: 'John' })
  })

  it('close() stops cursor', async () => {
    const cursor = new QueryCursor(mockQuery)

    await cursor.close()

    expect(cursor.closed).toBe(true)
    expect(await cursor.hasNext()).toBe(false)
    expect(await cursor.next()).toBeNull()
  })

  it('supports async iteration', async () => {
    const cursor = new QueryCursor(mockQuery)
    const visited: string[] = []

    for await (const doc of cursor) {
      visited.push(doc.name)
    }

    expect(visited).toEqual(['John', 'Jane'])
  })
})
