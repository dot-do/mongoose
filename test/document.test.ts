/**
 * Tests for Document class - document instances with change tracking
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Document } from '../src/document/index.js'
import { Schema } from '../src/schema/index.js'

describe('Document', () => {
  let UserSchema: Schema<{ name: string; age: number; email?: string }>

  beforeEach(() => {
    UserSchema = new Schema({
      name: { type: String, required: true },
      age: { type: Number, min: 0 },
      email: String,
    })
  })

  describe('constructor', () => {
    it('creates a document from data', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      expect(doc.name).toBe('John')
      expect(doc.age).toBe(30)
    })

    it('marks new documents as isNew', () => {
      const doc = new Document({ name: 'John' }, UserSchema)

      expect(doc.isNew).toBe(true)
    })

    it('allows _id to be set manually', () => {
      // Note: Document doesn't auto-generate _id - that's handled by the database or Schema
      const doc = new Document({ name: 'John', _id: '507f1f77bcf86cd799439011' } as any, UserSchema)

      expect(doc._id).toBe('507f1f77bcf86cd799439011')
    })

    it('preserves existing _id', () => {
      const id = '507f1f77bcf86cd799439011'
      const doc = new Document({ _id: id, name: 'John' }, UserSchema)

      expect(doc._id).toBe(id)
    })
  })

  describe('property access', () => {
    it('allows getting properties via proxy', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      expect(doc.name).toBe('John')
      expect(doc.age).toBe(30)
    })

    it('allows setting properties via proxy', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      doc.name = 'Jane'
      doc.age = 25

      expect(doc.name).toBe('Jane')
      expect(doc.age).toBe(25)
    })

    it('tracks modifications when setting properties', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      doc.name = 'Jane'

      expect(doc.isModified('name')).toBe(true)
      expect(doc.isModified('age')).toBe(false)
    })
  })

  describe('get() and set()', () => {
    it('get() retrieves values by path', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      expect(doc.get('name')).toBe('John')
      expect(doc.get('age')).toBe(30)
    })

    it('set() sets values by path', () => {
      const doc = new Document({ name: 'John' }, UserSchema)

      doc.set('name', 'Jane')
      doc.set('age', 25)

      expect(doc.name).toBe('Jane')
      expect(doc.age).toBe(25)
    })

    it('set() accepts object for multiple values', () => {
      const doc = new Document({ name: 'John' }, UserSchema)

      doc.set({ name: 'Jane', age: 25 })

      expect(doc.name).toBe('Jane')
      expect(doc.age).toBe(25)
    })

    it('get() with nested paths', () => {
      const schema = new Schema({
        profile: {
          name: String,
          bio: String,
        },
      })
      const doc = new Document(
        { profile: { name: 'John', bio: 'Developer' } },
        schema
      )

      expect(doc.get('profile.name')).toBe('John')
      expect(doc.get('profile.bio')).toBe('Developer')
    })
  })

  describe('modification tracking', () => {
    it('isModified() returns true for changed paths', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      doc.name = 'Jane'

      expect(doc.isModified('name')).toBe(true)
    })

    it('isModified() returns false for unchanged paths', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      doc.name = 'Jane'

      expect(doc.isModified('age')).toBe(false)
    })

    it('isModified() with no args returns true if any path modified', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      expect(doc.isModified()).toBe(false)

      doc.name = 'Jane'

      expect(doc.isModified()).toBe(true)
    })

    it('modifiedPaths() returns array of modified paths', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      doc.name = 'Jane'
      doc.age = 25

      const modified = doc.modifiedPaths()
      expect(modified).toContain('name')
      expect(modified).toContain('age')
    })

    it('directModifiedPaths() returns directly modified paths', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      doc.name = 'Jane'

      expect(doc.directModifiedPaths()).toContain('name')
    })

    it('markModified() marks a path as modified', () => {
      const doc = new Document({ name: 'John' }, UserSchema)

      doc.markModified('name')

      expect(doc.isModified('name')).toBe(true)
    })

    it('unmarkModified() clears modification flag', () => {
      const doc = new Document({ name: 'John' }, UserSchema)

      doc.name = 'Jane'
      doc.unmarkModified('name')

      expect(doc.isModified('name')).toBe(false)
    })
  })

  describe('toObject() and toJSON()', () => {
    it('toObject() returns plain object', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      const obj = doc.toObject()

      expect(obj).toEqual({ name: 'John', age: 30 })
      expect(obj).not.toBeInstanceOf(Document)
    })

    it('toJSON() returns JSON-serializable object', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      const json = doc.toJSON()

      expect(json).toEqual({ name: 'John', age: 30 })
    })

    it('toObject() respects getters option', () => {
      const schema = new Schema({
        firstName: String,
        lastName: String,
      })
      schema.virtual('fullName').get(function () {
        return `${this.firstName} ${this.lastName}`
      })

      const doc = new Document(
        { firstName: 'John', lastName: 'Doe' },
        schema
      )

      // Access virtual via proxy
      expect((doc as any).fullName).toBe('John Doe')

      const obj = doc.toObject({ getters: true, virtuals: true })
      expect(obj.fullName).toBe('John Doe')
    })

    it('toObject() respects transform option', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      const obj = doc.toObject({
        transform: (_doc, ret) => {
          delete ret.age
          return ret
        },
      })

      expect(obj.name).toBe('John')
      expect(obj.age).toBeUndefined()
    })
  })

  describe('validate()', () => {
    it('throws on required fields missing', async () => {
      const doc = new Document({ age: 30 }, UserSchema)

      // validate() throws MongooseValidationError when invalid
      await expect(doc.validate()).rejects.toThrow('Validation failed')
    })

    it('throws on min constraint violation', async () => {
      const doc = new Document({ name: 'John', age: -5 }, UserSchema)

      await expect(doc.validate()).rejects.toThrow('Validation failed')
    })

    it('passes for correct document', async () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      // Should not throw
      await expect(doc.validate()).resolves.toBeUndefined()
    })

    it('validates specific paths only', async () => {
      const doc = new Document({ name: 'John', age: -5 }, UserSchema)

      // With specific paths, only those are validated
      await expect(doc.validate(['age'])).rejects.toThrow('Validation failed')
    })
  })

  describe('isInit()', () => {
    it('returns true for paths that exist in the document', () => {
      const schema = new Schema({
        name: String,
        status: { type: String, default: 'pending' },
      })
      const doc = new Document({ name: 'Test' }, schema)

      expect(doc.isInit('name')).toBe(true)
    })
  })

  describe('equals()', () => {
    it('returns true for documents with same _id', () => {
      const id = '507f1f77bcf86cd799439011'
      const doc1 = new Document({ _id: id, name: 'John' }, UserSchema)
      const doc2 = new Document({ _id: id, name: 'Jane' }, UserSchema)

      expect(doc1.equals(doc2)).toBe(true)
    })

    it('returns false for documents with different _id', () => {
      const doc1 = new Document({ name: 'John' }, UserSchema)
      const doc2 = new Document({ name: 'John' }, UserSchema)

      expect(doc1.equals(doc2)).toBe(false)
    })
  })

  describe('populated()', () => {
    it('returns undefined for non-populated paths', () => {
      const doc = new Document({ name: 'John' }, UserSchema)

      expect(doc.populated('friends')).toBeUndefined()
    })
  })

  describe('$clone()', () => {
    it('creates a copy of the document', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      const clone = doc.$clone()

      expect(clone).not.toBe(doc)
      expect(clone.name).toBe('John')
      expect(clone.age).toBe(30)
    })

    it('cloned document has same _id', () => {
      const doc = new Document({ name: 'John', age: 30 }, UserSchema)

      const clone = doc.$clone()

      expect(clone._id).toBe(doc._id)
    })
  })

  describe('overwrite()', () => {
    it('replaces document data', () => {
      const doc = new Document({ name: 'John', age: 30, email: 'john@example.com' }, UserSchema)

      doc.overwrite({ name: 'Jane', age: 25 })

      expect(doc.name).toBe('Jane')
      expect(doc.age).toBe(25)
      expect(doc.email).toBeUndefined()
    })
  })
})
