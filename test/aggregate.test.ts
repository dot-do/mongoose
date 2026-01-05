/**
 * Tests for Aggregate class - aggregation pipeline builder
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Aggregate, AggregateCursor } from '../src/aggregate/index.js'
import { model, modelNames, deleteModel } from '../src/model/index.js'
import { Schema } from '../src/schema/index.js'

describe('Aggregate', () => {
  // Mock model for testing
  const mockModel = {
    collection: {
      aggregate: vi.fn().mockResolvedValue([]),
    },
    modelName: 'TestModel',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('creates an empty aggregate', () => {
      const agg = new Aggregate(mockModel)

      expect(agg.pipeline()).toEqual([])
    })

    it('creates aggregate with initial pipeline', () => {
      const pipeline = [{ $match: { active: true } }]
      const agg = new Aggregate(mockModel, pipeline)

      expect(agg.pipeline()).toEqual(pipeline)
    })

    it('copies initial pipeline to prevent mutation', () => {
      const pipeline = [{ $match: { active: true } }]
      const agg = new Aggregate(mockModel, pipeline)

      pipeline.push({ $limit: 10 })

      expect(agg.pipeline()).toEqual([{ $match: { active: true } }])
    })
  })

  describe('$match stage', () => {
    it('match() adds $match stage', () => {
      const agg = new Aggregate(mockModel)
        .match({ status: 'active' })

      expect(agg.pipeline()).toEqual([
        { $match: { status: 'active' } }
      ])
    })

    it('supports complex match conditions', () => {
      const agg = new Aggregate(mockModel)
        .match({ age: { $gte: 18, $lte: 65 }, active: true })

      expect(agg.pipeline()).toEqual([
        { $match: { age: { $gte: 18, $lte: 65 }, active: true } }
      ])
    })
  })

  describe('$project stage', () => {
    it('project() adds $project stage', () => {
      const agg = new Aggregate(mockModel)
        .project({ name: 1, email: 1, _id: 0 })

      expect(agg.pipeline()).toEqual([
        { $project: { name: 1, email: 1, _id: 0 } }
      ])
    })

    it('supports computed fields in projection', () => {
      const agg = new Aggregate(mockModel)
        .project({
          fullName: { $concat: ['$firstName', ' ', '$lastName'] },
          yearOfBirth: { $subtract: [2024, '$age'] }
        })

      expect(agg.pipeline()).toEqual([
        { $project: {
          fullName: { $concat: ['$firstName', ' ', '$lastName'] },
          yearOfBirth: { $subtract: [2024, '$age'] }
        }}
      ])
    })
  })

  describe('$group stage', () => {
    it('group() adds $group stage', () => {
      const agg = new Aggregate(mockModel)
        .group({ _id: '$department', count: { $sum: 1 } })

      expect(agg.pipeline()).toEqual([
        { $group: { _id: '$department', count: { $sum: 1 } } }
      ])
    })

    it('supports complex group operations', () => {
      const agg = new Aggregate(mockModel)
        .group({
          _id: { dept: '$department', year: { $year: '$hireDate' } },
          avgSalary: { $avg: '$salary' },
          totalEmployees: { $sum: 1 },
          names: { $push: '$name' }
        })

      expect(agg.pipeline()[0]).toEqual({
        $group: {
          _id: { dept: '$department', year: { $year: '$hireDate' } },
          avgSalary: { $avg: '$salary' },
          totalEmployees: { $sum: 1 },
          names: { $push: '$name' }
        }
      })
    })
  })

  describe('$sort stage', () => {
    it('sort() adds $sort stage', () => {
      const agg = new Aggregate(mockModel)
        .sort({ count: -1, name: 1 })

      expect(agg.pipeline()).toEqual([
        { $sort: { count: -1, name: 1 } }
      ])
    })

    it('supports $meta sort', () => {
      const agg = new Aggregate(mockModel)
        .sort({ score: { $meta: 'textScore' } })

      expect(agg.pipeline()).toEqual([
        { $sort: { score: { $meta: 'textScore' } } }
      ])
    })
  })

  describe('$limit stage', () => {
    it('limit() adds $limit stage', () => {
      const agg = new Aggregate(mockModel)
        .limit(10)

      expect(agg.pipeline()).toEqual([
        { $limit: 10 }
      ])
    })
  })

  describe('$skip stage', () => {
    it('skip() adds $skip stage', () => {
      const agg = new Aggregate(mockModel)
        .skip(20)

      expect(agg.pipeline()).toEqual([
        { $skip: 20 }
      ])
    })
  })

  describe('$unwind stage', () => {
    it('unwind() with string path', () => {
      const agg = new Aggregate(mockModel)
        .unwind('$tags')

      expect(agg.pipeline()).toEqual([
        { $unwind: '$tags' }
      ])
    })

    it('unwind() with options object', () => {
      const agg = new Aggregate(mockModel)
        .unwind({
          path: '$tags',
          preserveNullAndEmptyArrays: true,
          includeArrayIndex: 'tagIndex'
        })

      expect(agg.pipeline()).toEqual([
        { $unwind: {
          path: '$tags',
          preserveNullAndEmptyArrays: true,
          includeArrayIndex: 'tagIndex'
        }}
      ])
    })
  })

  describe('$lookup stage', () => {
    it('lookup() adds $lookup stage', () => {
      const agg = new Aggregate(mockModel)
        .lookup({
          from: 'orders',
          localField: '_id',
          foreignField: 'customerId',
          as: 'orders'
        })

      expect(agg.pipeline()).toEqual([
        { $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customerId',
          as: 'orders'
        }}
      ])
    })

    it('lookup() with pipeline', () => {
      const agg = new Aggregate(mockModel)
        .lookup({
          from: 'orders',
          let: { customerId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$customerId', '$$customerId'] } } },
            { $sort: { date: -1 } },
            { $limit: 5 }
          ],
          as: 'recentOrders'
        })

      expect(agg.pipeline()[0]).toHaveProperty('$lookup.pipeline')
    })
  })

  describe('$facet stage', () => {
    it('facet() adds $facet stage', () => {
      const agg = new Aggregate(mockModel)
        .facet({
          categories: [{ $group: { _id: '$category', count: { $sum: 1 } } }],
          priceStats: [{ $group: { _id: null, avg: { $avg: '$price' } } }]
        })

      expect(agg.pipeline()).toEqual([
        { $facet: {
          categories: [{ $group: { _id: '$category', count: { $sum: 1 } } }],
          priceStats: [{ $group: { _id: null, avg: { $avg: '$price' } } }]
        }}
      ])
    })
  })

  describe('$bucket stage', () => {
    it('bucket() adds $bucket stage', () => {
      const agg = new Aggregate(mockModel)
        .bucket({
          groupBy: '$price',
          boundaries: [0, 100, 500, 1000],
          default: 'Other',
          output: { count: { $sum: 1 } }
        })

      expect(agg.pipeline()).toEqual([
        { $bucket: {
          groupBy: '$price',
          boundaries: [0, 100, 500, 1000],
          default: 'Other',
          output: { count: { $sum: 1 } }
        }}
      ])
    })
  })

  describe('$bucketAuto stage', () => {
    it('bucketAuto() adds $bucketAuto stage', () => {
      const agg = new Aggregate(mockModel)
        .bucketAuto({
          groupBy: '$price',
          buckets: 4,
          granularity: 'POWERSOF2'
        })

      expect(agg.pipeline()).toEqual([
        { $bucketAuto: {
          groupBy: '$price',
          buckets: 4,
          granularity: 'POWERSOF2'
        }}
      ])
    })
  })

  describe('$addFields stage', () => {
    it('addFields() adds $addFields stage', () => {
      const agg = new Aggregate(mockModel)
        .addFields({
          fullName: { $concat: ['$firstName', ' ', '$lastName'] },
          isAdult: { $gte: ['$age', 18] }
        })

      expect(agg.pipeline()).toEqual([
        { $addFields: {
          fullName: { $concat: ['$firstName', ' ', '$lastName'] },
          isAdult: { $gte: ['$age', 18] }
        }}
      ])
    })
  })

  describe('$set stage', () => {
    it('set() adds $set stage', () => {
      const agg = new Aggregate(mockModel)
        .set({ processed: true })

      expect(agg.pipeline()).toEqual([
        { $set: { processed: true } }
      ])
    })
  })

  describe('$replaceRoot stage', () => {
    it('replaceRoot() adds $replaceRoot stage', () => {
      const agg = new Aggregate(mockModel)
        .replaceRoot({ newRoot: '$embeddedDoc' })

      expect(agg.pipeline()).toEqual([
        { $replaceRoot: { newRoot: '$embeddedDoc' } }
      ])
    })
  })

  describe('$replaceWith stage', () => {
    it('replaceWith() adds $replaceWith stage', () => {
      const agg = new Aggregate(mockModel)
        .replaceWith('$profile')

      expect(agg.pipeline()).toEqual([
        { $replaceWith: '$profile' }
      ])
    })
  })

  describe('$count stage', () => {
    it('count() adds $count stage', () => {
      const agg = new Aggregate(mockModel)
        .count('totalDocs')

      expect(agg.pipeline()).toEqual([
        { $count: 'totalDocs' }
      ])
    })
  })

  describe('$merge stage', () => {
    it('merge() with string', () => {
      const agg = new Aggregate(mockModel)
        .merge('outputCollection')

      expect(agg.pipeline()).toEqual([
        { $merge: { into: 'outputCollection' } }
      ])
    })

    it('merge() with options', () => {
      const agg = new Aggregate(mockModel)
        .merge({
          into: 'outputCollection',
          on: '_id',
          whenMatched: 'replace',
          whenNotMatched: 'insert'
        })

      expect(agg.pipeline()).toEqual([
        { $merge: {
          into: 'outputCollection',
          on: '_id',
          whenMatched: 'replace',
          whenNotMatched: 'insert'
        }}
      ])
    })
  })

  describe('$out stage', () => {
    it('out() adds $out stage', () => {
      const agg = new Aggregate(mockModel)
        .out('archivedOrders')

      expect(agg.pipeline()).toEqual([
        { $out: 'archivedOrders' }
      ])
    })
  })

  describe('$sample stage', () => {
    it('sample() with number', () => {
      const agg = new Aggregate(mockModel)
        .sample(100)

      expect(agg.pipeline()).toEqual([
        { $sample: { size: 100 } }
      ])
    })

    it('sample() with options', () => {
      const agg = new Aggregate(mockModel)
        .sample({ size: 100 })

      expect(agg.pipeline()).toEqual([
        { $sample: { size: 100 } }
      ])
    })
  })

  describe('$sortByCount stage', () => {
    it('sortByCount() adds $sortByCount stage', () => {
      const agg = new Aggregate(mockModel)
        .sortByCount('$category')

      expect(agg.pipeline()).toEqual([
        { $sortByCount: '$category' }
      ])
    })
  })

  describe('$graphLookup stage', () => {
    it('graphLookup() adds $graphLookup stage', () => {
      const agg = new Aggregate(mockModel)
        .graphLookup({
          from: 'employees',
          startWith: '$reportsTo',
          connectFromField: 'reportsTo',
          connectToField: 'name',
          as: 'reportingHierarchy',
          maxDepth: 5
        })

      expect(agg.pipeline()).toEqual([
        { $graphLookup: {
          from: 'employees',
          startWith: '$reportsTo',
          connectFromField: 'reportsTo',
          connectToField: 'name',
          as: 'reportingHierarchy',
          maxDepth: 5
        }}
      ])
    })
  })

  describe('$geoNear stage', () => {
    it('near() adds $geoNear as first stage', () => {
      const agg = new Aggregate(mockModel)
        .match({ category: 'restaurant' })
        .near({
          near: { type: 'Point', coordinates: [-73.99, 40.73] },
          distanceField: 'distance',
          spherical: true
        })

      // $geoNear should be first
      expect(agg.pipeline()[0]).toEqual({
        $geoNear: {
          near: { type: 'Point', coordinates: [-73.99, 40.73] },
          distanceField: 'distance',
          spherical: true
        }
      })
    })
  })

  describe('$unset stage', () => {
    it('unset() with single field', () => {
      const agg = new Aggregate(mockModel)
        .unset('password')

      expect(agg.pipeline()).toEqual([
        { $unset: 'password' }
      ])
    })

    it('unset() with array of fields', () => {
      const agg = new Aggregate(mockModel)
        .unset(['password', 'internalNotes'])

      expect(agg.pipeline()).toEqual([
        { $unset: ['password', 'internalNotes'] }
      ])
    })
  })

  describe('$unionWith stage', () => {
    it('unionWith() with string', () => {
      const agg = new Aggregate(mockModel)
        .unionWith('archivedOrders')

      expect(agg.pipeline()).toEqual([
        { $unionWith: { coll: 'archivedOrders' } }
      ])
    })

    it('unionWith() with options', () => {
      const agg = new Aggregate(mockModel)
        .unionWith({
          coll: 'archivedOrders',
          pipeline: [{ $match: { status: 'completed' } }]
        })

      expect(agg.pipeline()).toEqual([
        { $unionWith: {
          coll: 'archivedOrders',
          pipeline: [{ $match: { status: 'completed' } }]
        }}
      ])
    })
  })

  describe('$setWindowFields stage', () => {
    it('setWindowFields() adds $setWindowFields stage', () => {
      const agg = new Aggregate(mockModel)
        .setWindowFields({
          partitionBy: '$category',
          sortBy: { date: 1 },
          output: {
            runningTotal: { $sum: '$amount', window: { documents: ['unbounded', 'current'] } }
          }
        })

      expect(agg.pipeline()[0]).toHaveProperty('$setWindowFields')
    })
  })

  describe('$redact stage', () => {
    it('redact() adds $redact stage', () => {
      const agg = new Aggregate(mockModel)
        .redact({
          $cond: {
            if: { $eq: ['$level', 'public'] },
            then: '$$DESCEND',
            else: '$$PRUNE'
          }
        })

      expect(agg.pipeline()).toEqual([
        { $redact: {
          $cond: {
            if: { $eq: ['$level', 'public'] },
            then: '$$DESCEND',
            else: '$$PRUNE'
          }
        }}
      ])
    })
  })

  describe('append() and addStage()', () => {
    it('append() adds multiple stages', () => {
      const agg = new Aggregate(mockModel)
        .append(
          { $match: { active: true } },
          { $sort: { date: -1 } },
          { $limit: 10 }
        )

      expect(agg.pipeline()).toEqual([
        { $match: { active: true } },
        { $sort: { date: -1 } },
        { $limit: 10 }
      ])
    })

    it('addStage() adds single stage', () => {
      const agg = new Aggregate(mockModel)
        .addStage({ $match: { status: 'pending' } })

      expect(agg.pipeline()).toEqual([
        { $match: { status: 'pending' } }
      ])
    })
  })

  describe('chaining', () => {
    it('supports method chaining', () => {
      const agg = new Aggregate(mockModel)
        .match({ active: true })
        .project({ name: 1, amount: 1 })
        .group({ _id: '$category', total: { $sum: '$amount' } })
        .sort({ total: -1 })
        .limit(10)

      expect(agg.pipeline()).toHaveLength(5)
      expect(agg.pipeline()[0]).toHaveProperty('$match')
      expect(agg.pipeline()[1]).toHaveProperty('$project')
      expect(agg.pipeline()[2]).toHaveProperty('$group')
      expect(agg.pipeline()[3]).toHaveProperty('$sort')
      expect(agg.pipeline()[4]).toHaveProperty('$limit')
    })
  })

  describe('options', () => {
    it('option() sets single option', () => {
      const agg = new Aggregate(mockModel)
        .option('allowDiskUse', true)

      expect(agg.getOptions().allowDiskUse).toBe(true)
    })

    it('setOptions() sets multiple options', () => {
      const agg = new Aggregate(mockModel)
        .setOptions({
          allowDiskUse: true,
          maxTimeMS: 5000,
          comment: 'test aggregation'
        })

      expect(agg.getOptions().allowDiskUse).toBe(true)
      expect(agg.getOptions().maxTimeMS).toBe(5000)
      expect(agg.getOptions().comment).toBe('test aggregation')
    })

    it('allowDiskUse() sets allow disk use option', () => {
      const agg = new Aggregate(mockModel).allowDiskUse()

      expect(agg.getOptions().allowDiskUse).toBe(true)
    })

    it('batchSize() sets batch size', () => {
      const agg = new Aggregate(mockModel).batchSize(100)

      expect(agg.getOptions().batchSize).toBe(100)
    })

    it('read() sets read preference', () => {
      const agg = new Aggregate(mockModel).read('secondary')

      expect(agg.getOptions().readPreference).toBe('secondary')
    })

    it('maxTimeMS() sets max time', () => {
      const agg = new Aggregate(mockModel).maxTimeMS(5000)

      expect(agg.getOptions().maxTimeMS).toBe(5000)
    })

    it('comment() sets comment', () => {
      const agg = new Aggregate(mockModel).comment('test')

      expect(agg.getOptions().comment).toBe('test')
    })

    it('hint() sets hint', () => {
      const agg = new Aggregate(mockModel).hint({ name: 1 })

      expect(agg.getOptions().hint).toEqual({ name: 1 })
    })

    it('collation() sets collation', () => {
      const agg = new Aggregate(mockModel).collation({ locale: 'en' })

      expect(agg.getOptions().collation).toEqual({ locale: 'en' })
    })

    it('let() sets let variables', () => {
      const agg = new Aggregate(mockModel).let({ customerId: '$_id' })

      expect(agg.getOptions().let).toEqual({ customerId: '$_id' })
    })

    it('session() sets session', () => {
      const mockSession = { id: 'test-session' }
      const agg = new Aggregate(mockModel).session(mockSession)

      expect(agg.getOptions().session).toBe(mockSession)
    })
  })

  describe('utility methods', () => {
    it('pipeline() returns current pipeline', () => {
      const agg = new Aggregate(mockModel)
        .match({ active: true })
        .limit(10)

      const pipeline = agg.pipeline()

      expect(pipeline).toHaveLength(2)
      expect(pipeline[0]).toEqual({ $match: { active: true } })
    })

    it('pipeline() returns a copy', () => {
      const agg = new Aggregate(mockModel).match({ active: true })

      const pipeline = agg.pipeline()
      pipeline.push({ $limit: 10 })

      expect(agg.pipeline()).toHaveLength(1)
    })

    it('model() returns model reference', () => {
      const agg = new Aggregate(mockModel)

      expect(agg.model()).toBe(mockModel)
    })

    it('clone() creates copy of aggregate', () => {
      const agg = new Aggregate(mockModel)
        .match({ active: true })
        .allowDiskUse()

      const cloned = agg.clone()

      expect(cloned).not.toBe(agg)
      expect(cloned.pipeline()).toEqual(agg.pipeline())
      expect(cloned.getOptions()).toEqual(agg.getOptions())
    })

    it('toString() returns string representation', () => {
      const agg = new Aggregate(mockModel).match({ active: true })

      const str = agg.toString()

      expect(str).toContain('Aggregate')
      expect(str).toContain('pipeline')
      expect(str).toContain('active')
    })
  })

  describe('execution', () => {
    it('exec() executes the aggregation', async () => {
      mockModel.collection.aggregate.mockResolvedValue([
        { _id: 'electronics', count: 100 },
        { _id: 'clothing', count: 50 }
      ])

      const agg = new Aggregate(mockModel)
        .match({ active: true })
        .group({ _id: '$category', count: { $sum: 1 } })

      const result = await agg.exec()

      expect(mockModel.collection.aggregate).toHaveBeenCalledWith(
        agg.pipeline(),
        agg.getOptions()
      )
      expect(result).toEqual([
        { _id: 'electronics', count: 100 },
        { _id: 'clothing', count: 50 }
      ])
    })

    it('then() makes aggregate thenable', async () => {
      mockModel.collection.aggregate.mockResolvedValue([{ count: 42 }])

      const agg = new Aggregate(mockModel).count('count')

      const result = await agg

      expect(result).toEqual([{ count: 42 }])
    })

    it('catch() handles rejection', async () => {
      mockModel.collection.aggregate.mockRejectedValue(new Error('Aggregation failed'))

      const agg = new Aggregate(mockModel).match({})

      await expect(agg).rejects.toThrow('Aggregation failed')
    })

    it('explain() returns execution plan', async () => {
      const agg = new Aggregate(mockModel).match({ active: true })

      const plan = await agg.explain()

      expect(plan).toHaveProperty('stages')
      expect(plan).toHaveProperty('queryPlanner')
    })
  })
})

describe('AggregateCursor', () => {
  const mockAggregate = {
    clone: () => ({
      exec: vi.fn().mockResolvedValue([
        { _id: 'a', count: 10 },
        { _id: 'b', count: 20 }
      ]),
    }),
  } as any

  it('hasNext() returns true when documents available', async () => {
    const cursor = new AggregateCursor(mockAggregate)

    expect(await cursor.hasNext()).toBe(true)
  })

  it('next() returns next document', async () => {
    const cursor = new AggregateCursor(mockAggregate)

    const doc1 = await cursor.next()
    const doc2 = await cursor.next()

    expect(doc1).toEqual({ _id: 'a', count: 10 })
    expect(doc2).toEqual({ _id: 'b', count: 20 })
  })

  it('next() returns null when exhausted', async () => {
    const cursor = new AggregateCursor(mockAggregate)

    await cursor.next()
    await cursor.next()
    const doc3 = await cursor.next()

    expect(doc3).toBeNull()
  })

  it('toArray() returns all documents', async () => {
    const cursor = new AggregateCursor(mockAggregate)

    const docs = await cursor.toArray()

    expect(docs).toEqual([
      { _id: 'a', count: 10 },
      { _id: 'b', count: 20 }
    ])
  })

  it('eachAsync() iterates over documents', async () => {
    const cursor = new AggregateCursor(mockAggregate)
    const visited: string[] = []

    await cursor.eachAsync((doc) => {
      visited.push(doc._id)
    })

    expect(visited).toEqual(['a', 'b'])
  })

  it('map() transforms documents', async () => {
    const cursor = new AggregateCursor(mockAggregate)

    const ids = await cursor.map((doc) => doc._id)

    expect(ids).toEqual(['a', 'b'])
  })

  it('rewind() resets cursor position', async () => {
    const cursor = new AggregateCursor(mockAggregate)

    await cursor.next()
    await cursor.next()
    cursor.rewind()

    const doc = await cursor.next()
    expect(doc).toEqual({ _id: 'a', count: 10 })
  })

  it('close() stops cursor', async () => {
    const cursor = new AggregateCursor(mockAggregate)

    await cursor.close()

    expect(cursor.closed).toBe(true)
    expect(await cursor.hasNext()).toBe(false)
    expect(await cursor.next()).toBeNull()
  })

  it('supports async iteration', async () => {
    const cursor = new AggregateCursor(mockAggregate)
    const visited: string[] = []

    for await (const doc of cursor) {
      visited.push(doc._id)
    }

    expect(visited).toEqual(['a', 'b'])
  })
})

describe('Model.aggregate() integration', () => {
  let User: any

  beforeEach(() => {
    for (const name of modelNames()) {
      deleteModel(name)
    }

    const schema = new Schema({
      name: String,
      age: Number,
      department: String,
    })

    User = model('User', schema)
  })

  it('Model.aggregate() returns Aggregate instance', () => {
    const agg = User.aggregate()

    expect(agg).toBeInstanceOf(Aggregate)
  })

  it('Model.aggregate() with initial pipeline', () => {
    const agg = User.aggregate([{ $match: { active: true } }])

    expect(agg.pipeline()).toEqual([{ $match: { active: true } }])
  })

  it('supports chaining from Model.aggregate()', () => {
    const agg = User.aggregate()
      .match({ department: 'Engineering' })
      .group({ _id: '$department', count: { $sum: 1 } })
      .sort({ count: -1 })

    expect(agg.pipeline()).toHaveLength(3)
  })
})

describe('Aggregate with hooks', () => {
  beforeEach(() => {
    for (const name of modelNames()) {
      deleteModel(name)
    }
  })

  it('runs pre-aggregate hooks', async () => {
    const preHook = vi.fn((next) => next())

    const schema = new Schema({ name: String })
    schema.pre('aggregate', preHook)

    const TestModel = model('TestHook', schema)

    const agg = new Aggregate(TestModel)
      .match({ active: true })

    await agg.exec()

    expect(preHook).toHaveBeenCalled()
  })

  it('runs post-aggregate hooks', async () => {
    const postHook = vi.fn((result, next) => next())

    const schema = new Schema({ name: String })
    schema.post('aggregate', postHook)

    const TestModel = model('TestPostHook', schema)

    const agg = new Aggregate(TestModel)
      .match({ active: true })

    await agg.exec()

    expect(postHook).toHaveBeenCalled()
  })
})
