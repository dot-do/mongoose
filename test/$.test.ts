/**
 * Tests for the $ namespace - Zod-style TypeScript-first API
 */
import { describe, it, expect } from 'vitest'
import { $ } from '../src/$.js'
import {
  StringType,
  NumberType,
  BooleanType,
  DateType,
  ObjectIdType,
  ArrayType,
  ObjectType,
  EnumType,
  LiteralType,
  MapType,
  MixedType,
  BufferType,
  BigIntType,
} from '../src/types/index.js'
import { Schema } from '../src/schema/index.js'

describe('$ namespace', () => {
  describe('primitive types', () => {
    it('$.string() creates a StringType', () => {
      const type = $.string()
      expect(type).toBeInstanceOf(StringType)
    })

    it('$.number() creates a NumberType', () => {
      const type = $.number()
      expect(type).toBeInstanceOf(NumberType)
    })

    it('$.boolean() creates a BooleanType', () => {
      const type = $.boolean()
      expect(type).toBeInstanceOf(BooleanType)
    })

    it('$.date() creates a DateType', () => {
      const type = $.date()
      expect(type).toBeInstanceOf(DateType)
    })

    it('$.objectId() creates an ObjectIdType', () => {
      const type = $.objectId()
      expect(type).toBeInstanceOf(ObjectIdType)
    })

    it('$.buffer() creates a BufferType', () => {
      const type = $.buffer()
      expect(type).toBeInstanceOf(BufferType)
    })

    it('$.bigint() creates a BigIntType', () => {
      const type = $.bigint()
      expect(type).toBeInstanceOf(BigIntType)
    })
  })

  describe('complex types', () => {
    it('$.array() creates an ArrayType', () => {
      const type = $.array($.string())
      expect(type).toBeInstanceOf(ArrayType)
    })

    it('$.object() creates an ObjectType', () => {
      const type = $.object({
        name: $.string(),
        age: $.number(),
      })
      expect(type).toBeInstanceOf(ObjectType)
    })

    it('$.map() creates a MapType', () => {
      const type = $.map($.number())
      expect(type).toBeInstanceOf(MapType)
    })
  })

  describe('unions and enums', () => {
    it('$.enum() creates an EnumType', () => {
      const type = $.enum(['admin', 'user', 'guest'])
      expect(type).toBeInstanceOf(EnumType)
    })

    it('$.literal() creates a LiteralType', () => {
      const type = $.literal('active')
      expect(type).toBeInstanceOf(LiteralType)
    })
  })

  describe('special types', () => {
    it('$.mixed() creates a MixedType', () => {
      const type = $.mixed()
      expect(type).toBeInstanceOf(MixedType)
    })

    it('$.any() is an alias for $.mixed()', () => {
      const type = $.any()
      expect(type).toBeInstanceOf(MixedType)
    })
  })

  describe('schema creation', () => {
    it('$.schema() creates a Schema from shape', () => {
      const userSchema = $.schema({
        name: $.string().required(),
        email: $.string(),
        age: $.number().min(0),
      })

      expect(userSchema).toBeInstanceOf(Schema)
    })

    it('$.schema() with options', () => {
      const userSchema = $.schema(
        {
          name: $.string().required(),
        },
        { timestamps: true }
      )

      expect(userSchema).toBeInstanceOf(Schema)
      expect(userSchema.options.timestamps).toBe(true)
    })
  })

  describe('chaining', () => {
    it('supports fluent chaining on string type', () => {
      const type = $.string()
        .required()
        .min(2)
        .max(50)
        .trim()
        .lowercase()

      expect(type).toBeInstanceOf(StringType)
    })

    it('supports fluent chaining on number type', () => {
      const type = $.number().required().min(0).max(100)

      expect(type).toBeInstanceOf(NumberType)
    })

    it('supports ref on objectId', () => {
      const type = $.objectId().ref('User')

      expect(type).toBeInstanceOf(ObjectIdType)
      expect(type._getOptions().ref).toBe('User')
    })
  })

  describe('real-world schemas', () => {
    it('creates a complex user schema', () => {
      const userSchema = $.schema({
        name: $.string().required().min(2).max(50),
        email: $.string().required(),
        password: $.string().required().min(8),
        age: $.number().min(0).max(150),
        role: $.enum(['admin', 'user', 'guest']),
        isActive: $.boolean(),
        createdAt: $.date(),
        profile: $.object({
          avatar: $.string(),
          bio: $.string().max(500),
        }),
        friends: $.array($.objectId().ref('User')),
        settings: $.map($.mixed()),
      })

      expect(userSchema).toBeInstanceOf(Schema)
    })

    it('creates a blog post schema with refs', () => {
      const postSchema = $.schema({
        title: $.string().required().min(1).max(200),
        content: $.string().required(),
        slug: $.string().required(),
        author: $.objectId().ref('User').required(),
        tags: $.array($.string()),
        status: $.enum(['draft', 'published', 'archived']),
        publishedAt: $.date(),
        comments: $.array(
          $.object({
            user: $.objectId().ref('User'),
            text: $.string().required(),
            createdAt: $.date(),
          })
        ),
      })

      expect(postSchema).toBeInstanceOf(Schema)
    })
  })
})
