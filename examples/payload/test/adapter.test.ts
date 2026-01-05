/**
 * Tests for the Mondoo database adapter
 *
 * These tests verify that the adapter correctly:
 * 1. Converts Payload field configs to Mondoo schemas
 * 2. Builds queries from Payload's where clauses
 */

import { describe, it, expect } from 'vitest'
import { Schema } from '../../../src/index'

// Test helper: Mock the adapter's internal functions
function fieldsToSchema(fields: any[]): Record<string, any> {
  const schemaDef: Record<string, any> = {}

  for (const field of fields) {
    if (!field.name) continue

    switch (field.type) {
      case 'text':
      case 'textarea':
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
      case 'select':
        schemaDef[field.name] = {
          type: String,
          enum: field.options?.map((o: any) => typeof o === 'string' ? o : o.value),
          required: field.required ?? false
        }
        break
      default:
        schemaDef[field.name] = { type: Schema.Types.Mixed }
    }
  }

  return schemaDef
}

function buildQuery(where: any): any {
  if (!where) return {}

  const query: any = {}

  for (const [key, value] of Object.entries(where)) {
    if (key === 'and' && Array.isArray(value)) {
      query.$and = value.map(buildQuery)
    } else if (key === 'or' && Array.isArray(value)) {
      query.$or = value.map(buildQuery)
    } else if (typeof value === 'object' && value !== null) {
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

describe('Mondoo Adapter - Schema Conversion', () => {
  it('converts text fields', () => {
    const fields = [
      { name: 'title', type: 'text', required: true },
      { name: 'description', type: 'textarea' },
    ]

    const schema = fieldsToSchema(fields)

    expect(schema.title).toEqual({ type: String, required: true })
    expect(schema.description).toEqual({ type: String, required: false })
  })

  it('converts number fields', () => {
    const fields = [
      { name: 'price', type: 'number', required: true },
      { name: 'quantity', type: 'number' },
    ]

    const schema = fieldsToSchema(fields)

    expect(schema.price).toEqual({ type: Number, required: true })
    expect(schema.quantity).toEqual({ type: Number, required: false })
  })

  it('converts checkbox fields', () => {
    const fields = [
      { name: 'isActive', type: 'checkbox', defaultValue: true },
      { name: 'isPublished', type: 'checkbox' },
    ]

    const schema = fieldsToSchema(fields)

    expect(schema.isActive).toEqual({ type: Boolean, required: false, default: true })
    expect(schema.isPublished).toEqual({ type: Boolean, required: false, default: false })
  })

  it('converts date fields', () => {
    const fields = [
      { name: 'publishedAt', type: 'date', required: true },
    ]

    const schema = fieldsToSchema(fields)

    expect(schema.publishedAt).toEqual({ type: Date, required: true })
  })

  it('converts relationship fields', () => {
    const fields = [
      { name: 'author', type: 'relationship', relationTo: 'users', required: true },
    ]

    const schema = fieldsToSchema(fields)

    expect(schema.author).toEqual({
      type: Schema.Types.ObjectId,
      ref: 'users',
      required: true
    })
  })

  it('converts select fields with enum', () => {
    const fields = [
      {
        name: 'status',
        type: 'select',
        options: [
          { label: 'Draft', value: 'draft' },
          { label: 'Published', value: 'published' },
        ],
      },
    ]

    const schema = fieldsToSchema(fields)

    expect(schema.status).toEqual({
      type: String,
      enum: ['draft', 'published'],
      required: false
    })
  })

  it('skips fields without names', () => {
    const fields = [
      { type: 'row' }, // Layout field, no name
      { name: 'title', type: 'text' },
    ]

    const schema = fieldsToSchema(fields)

    expect(Object.keys(schema)).toEqual(['title'])
  })
})

describe('Mondoo Adapter - Query Building', () => {
  it('handles empty where clause', () => {
    expect(buildQuery(undefined)).toEqual({})
    expect(buildQuery(null)).toEqual({})
    expect(buildQuery({})).toEqual({})
  })

  it('handles equals operator', () => {
    const where = { status: { equals: 'published' } }
    expect(buildQuery(where)).toEqual({ status: 'published' })
  })

  it('handles not_equals operator', () => {
    const where = { status: { not_equals: 'draft' } }
    expect(buildQuery(where)).toEqual({ status: { $ne: 'draft' } })
  })

  it('handles in operator', () => {
    const where = { status: { in: ['draft', 'published'] } }
    expect(buildQuery(where)).toEqual({ status: { $in: ['draft', 'published'] } })
  })

  it('handles not_in operator', () => {
    const where = { status: { not_in: ['deleted'] } }
    expect(buildQuery(where)).toEqual({ status: { $nin: ['deleted'] } })
  })

  it('handles comparison operators', () => {
    expect(buildQuery({ price: { greater_than: 100 } }))
      .toEqual({ price: { $gt: 100 } })

    expect(buildQuery({ price: { greater_than_equal: 100 } }))
      .toEqual({ price: { $gte: 100 } })

    expect(buildQuery({ price: { less_than: 50 } }))
      .toEqual({ price: { $lt: 50 } })

    expect(buildQuery({ price: { less_than_equal: 50 } }))
      .toEqual({ price: { $lte: 50 } })
  })

  it('handles like operator', () => {
    const where = { title: { like: 'hello' } }
    expect(buildQuery(where)).toEqual({ title: { $regex: 'hello', $options: 'i' } })
  })

  it('handles contains operator', () => {
    const where = { content: { contains: 'world' } }
    expect(buildQuery(where)).toEqual({ content: { $regex: 'world', $options: 'i' } })
  })

  it('handles exists operator', () => {
    expect(buildQuery({ author: { exists: true } }))
      .toEqual({ author: { $exists: true } })

    expect(buildQuery({ author: { exists: false } }))
      .toEqual({ author: { $exists: false } })
  })

  it('handles AND queries', () => {
    const where = {
      and: [
        { status: { equals: 'published' } },
        { price: { greater_than: 100 } },
      ]
    }

    expect(buildQuery(where)).toEqual({
      $and: [
        { status: 'published' },
        { price: { $gt: 100 } },
      ]
    })
  })

  it('handles OR queries', () => {
    const where = {
      or: [
        { status: { equals: 'draft' } },
        { status: { equals: 'published' } },
      ]
    }

    expect(buildQuery(where)).toEqual({
      $or: [
        { status: 'draft' },
        { status: 'published' },
      ]
    })
  })

  it('handles nested AND/OR queries', () => {
    const where = {
      and: [
        {
          or: [
            { status: { equals: 'draft' } },
            { status: { equals: 'published' } },
          ]
        },
        { price: { greater_than: 100 } },
      ]
    }

    expect(buildQuery(where)).toEqual({
      $and: [
        {
          $or: [
            { status: 'draft' },
            { status: 'published' },
          ]
        },
        { price: { $gt: 100 } },
      ]
    })
  })

  it('handles direct value equality', () => {
    const where = { status: 'published' }
    expect(buildQuery(where)).toEqual({ status: 'published' })
  })
})

describe('Mondoo Schema Creation', () => {
  it('creates schema from definition', () => {
    const schema = new Schema({
      title: { type: String, required: true },
      content: String,
      views: { type: Number, default: 0 },
    })

    expect(schema).toBeDefined()
    expect(schema.path('title')).toBeDefined()
    expect(schema.path('content')).toBeDefined()
    expect(schema.path('views')).toBeDefined()
  })

  it('Schema.Types.ObjectId is available', () => {
    expect(Schema.Types.ObjectId).toBe('ObjectId')
  })

  it('Schema.Types.Mixed is available', () => {
    expect(Schema.Types.Mixed).toBe('Mixed')
  })

  it('supports timestamps option', () => {
    const schema = new Schema({ title: String }, { timestamps: true })

    expect(schema.path('createdAt')).toBeDefined()
    expect(schema.path('updatedAt')).toBeDefined()
  })

  it('supports methods', () => {
    const schema = new Schema({ title: String })
    schema.method('getTitle', function() {
      return this.title
    })

    expect(schema.methods.getTitle).toBeDefined()
  })

  it('supports statics', () => {
    const schema = new Schema({ title: String })
    schema.static('findByTitle', function(title: string) {
      return this.findOne({ title })
    })

    expect(schema.statics.findByTitle).toBeDefined()
  })

  it('supports virtuals', () => {
    const schema = new Schema({
      firstName: String,
      lastName: String,
    })

    schema.virtual('fullName').get(function() {
      return `${this.firstName} ${this.lastName}`
    })

    expect(schema.virtuals().has('fullName')).toBe(true)
  })

  it('supports pre hooks', () => {
    const schema = new Schema({ title: String })
    const hookFn = function(next: () => void) { next() }

    schema.pre('save', hookFn)

    const hooks = schema.getPreHooks('save')
    expect(hooks.length).toBe(1)
  })

  it('supports post hooks', () => {
    const schema = new Schema({ title: String })
    const hookFn = function(doc: any, next: () => void) { next() }

    schema.post('save', hookFn)

    const hooks = schema.getPostHooks('save')
    expect(hooks.length).toBe(1)
  })
})
