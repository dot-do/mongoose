/**
 * Tests for SchemaTypes - the building blocks of schema definitions
 */
import { describe, it, expect } from 'vitest'
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

describe('StringType', () => {
  it('should create a string type', () => {
    const type = new StringType()
    expect(type).toBeInstanceOf(StringType)
  })

  it('should validate min/max length', async () => {
    const type = new StringType().min(2).max(10)

    expect(await type._validate('ab')).toBe(true)
    expect(await type._validate('a')).toBe(false)
    expect(await type._validate('12345678901')).toBe(false)
  })

  it('should support regex validation', async () => {
    const type = new StringType().regex(/^[a-z]+$/)

    expect(await type._validate('abc')).toBe(true)
    expect(await type._validate('ABC')).toBe(false)
  })

  it('should cast values to string', () => {
    const type = new StringType()
    expect(type._cast(123)).toBe('123')
    expect(type._cast(null)).toBe('')
  })

  it('should handle required validation', () => {
    const type = new StringType().required()
    expect(type._getOptions().required).toBe(true)
  })

  it('should support email validation', async () => {
    const type = new StringType().email()

    expect(await type._validate('test@example.com')).toBe(true)
    expect(await type._validate('invalid')).toBe(false)
  })

  it('should support url validation', async () => {
    const type = new StringType().url()

    expect(await type._validate('https://example.com')).toBe(true)
    expect(await type._validate('not-a-url')).toBe(false)
  })

  it('should support uuid validation', async () => {
    const type = new StringType().uuid()

    expect(await type._validate('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(await type._validate('not-a-uuid')).toBe(false)
  })
})

describe('NumberType', () => {
  it('should create a number type', () => {
    const type = new NumberType()
    expect(type).toBeInstanceOf(NumberType)
  })

  it('should validate min/max values', async () => {
    const type = new NumberType().min(0).max(100)

    expect(await type._validate(50)).toBe(true)
    expect(await type._validate(-1)).toBe(false)
    expect(await type._validate(101)).toBe(false)
  })

  it('should cast strings to numbers', () => {
    const type = new NumberType()
    expect(type._cast('42')).toBe(42)
    expect(type._cast('3.14')).toBe(3.14)
  })

  it('should validate integers', async () => {
    const type = new NumberType().int()

    expect(await type._validate(42)).toBe(true)
    expect(await type._validate(3.14)).toBe(false)
  })

  it('should validate positive numbers', async () => {
    const type = new NumberType().positive()

    expect(await type._validate(1)).toBe(true)
    expect(await type._validate(-1)).toBe(false)
    expect(await type._validate(0)).toBe(false)
  })

  it('should validate negative numbers', async () => {
    const type = new NumberType().negative()

    expect(await type._validate(-1)).toBe(true)
    expect(await type._validate(1)).toBe(false)
  })
})

describe('BooleanType', () => {
  it('should create a boolean type', () => {
    const type = new BooleanType()
    expect(type).toBeInstanceOf(BooleanType)
  })

  it('should cast values to boolean', () => {
    const type = new BooleanType()

    expect(type._cast(true)).toBe(true)
    expect(type._cast(false)).toBe(false)
    expect(type._cast('true')).toBe(true)
    expect(type._cast('')).toBe(false)
    expect(type._cast(1)).toBe(true)
    expect(type._cast(0)).toBe(false)
  })
})

describe('DateType', () => {
  it('should create a date type', () => {
    const type = new DateType()
    expect(type).toBeInstanceOf(DateType)
  })

  it('should validate min/max dates', async () => {
    const min = new Date('2020-01-01')
    const max = new Date('2025-12-31')
    const type = new DateType().min(min).max(max)

    expect(await type._validate(new Date('2023-06-15'))).toBe(true)
    expect(await type._validate(new Date('2019-01-01'))).toBe(false)
    expect(await type._validate(new Date('2026-01-01'))).toBe(false)
  })

  it('should cast strings and numbers to dates', () => {
    const type = new DateType()

    const dateStr = type._cast('2023-06-15')
    expect(dateStr).toBeInstanceOf(Date)

    const dateNum = type._cast(1686787200000)
    expect(dateNum).toBeInstanceOf(Date)
  })
})

describe('ObjectIdType', () => {
  it('should create an objectId type', () => {
    const type = new ObjectIdType()
    expect(type).toBeInstanceOf(ObjectIdType)
  })

  it('should support ref option', () => {
    const type = new ObjectIdType().ref('User')
    expect(type._getOptions().ref).toBe('User')
  })

  it('should validate ObjectId format', async () => {
    const type = new ObjectIdType()

    expect(await type._validate('507f1f77bcf86cd799439011')).toBe(true)
    expect(await type._validate('invalid')).toBe(false)
  })
})

describe('ArrayType', () => {
  it('should create an array type with item type', () => {
    const type = new ArrayType(new StringType())
    expect(type).toBeInstanceOf(ArrayType)
  })

  it('should validate item types', async () => {
    const type = new ArrayType(new NumberType().min(0))

    expect(await type._validate([1, 2, 3])).toBe(true)
    expect(await type._validate([-1, 2, 3])).toBe(false)
  })

  it('should cast to array', () => {
    const type = new ArrayType(new StringType())
    expect(type._cast(['a', 'b'])).toEqual(['a', 'b'])
    expect(type._cast(null)).toEqual([])
  })
})

describe('ObjectType', () => {
  it('should create an object type with shape', () => {
    const type = new ObjectType({
      name: new StringType(),
      age: new NumberType(),
    })
    expect(type).toBeInstanceOf(ObjectType)
  })
})

describe('EnumType', () => {
  it('should create an enum type', () => {
    const type = new EnumType(['admin', 'user', 'guest'] as const)
    expect(type).toBeInstanceOf(EnumType)
  })

  it('should validate enum values', async () => {
    const type = new EnumType(['admin', 'user', 'guest'] as const)

    expect(await type._validate('admin')).toBe(true)
    expect(await type._validate('superuser')).toBe(false)
  })
})

describe('LiteralType', () => {
  it('should create a literal type', () => {
    const type = new LiteralType('active')
    expect(type).toBeInstanceOf(LiteralType)
  })

  it('should validate exact value', async () => {
    const type = new LiteralType('active')

    expect(await type._validate('active')).toBe(true)
    expect(await type._validate('inactive')).toBe(false)
  })
})

describe('MapType', () => {
  it('should create a map type', () => {
    const type = new MapType(new NumberType())
    expect(type).toBeInstanceOf(MapType)
  })

  it('should validate map values', async () => {
    const type = new MapType(new NumberType().min(0))

    expect(await type._validate({ a: 1, b: 2 })).toBe(true)
    expect(await type._validate({ a: -1 })).toBe(false)
  })
})

describe('MixedType', () => {
  it('should create a mixed type', () => {
    const type = new MixedType()
    expect(type).toBeInstanceOf(MixedType)
  })

  it('should accept any value', async () => {
    const type = new MixedType()

    expect(await type._validate('string')).toBe(true)
    expect(await type._validate(123)).toBe(true)
    expect(await type._validate({ nested: true })).toBe(true)
    expect(await type._validate([1, 2, 3])).toBe(true)
  })
})

describe('BufferType', () => {
  it('should create a buffer type', () => {
    const type = new BufferType()
    expect(type).toBeInstanceOf(BufferType)
  })
})

describe('BigIntType', () => {
  it('should create a bigint type', () => {
    const type = new BigIntType()
    expect(type).toBeInstanceOf(BigIntType)
  })

  it('should cast to bigint', () => {
    const type = new BigIntType()
    expect(type._cast(123)).toBe(123n)
    expect(type._cast('12345678901234567890')).toBe(12345678901234567890n)
  })
})
