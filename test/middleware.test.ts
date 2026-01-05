/**
 * Tests for Middleware system - pre/post hooks
 */
import { describe, it, expect, vi } from 'vitest'
import {
  MiddlewareChain,
  MiddlewareError,
  isDocumentHook,
  isQueryHook,
  isModelHook,
  isAggregateHook,
} from '../src/middleware/index.js'

describe('MiddlewareChain', () => {
  describe('pre hooks', () => {
    it('executes pre hooks in order', async () => {
      const chain = new MiddlewareChain('save')
      const order: number[] = []

      chain.addPre(async function () {
        order.push(1)
      })
      chain.addPre(async function () {
        order.push(2)
      })
      chain.addPre(async function () {
        order.push(3)
      })

      await chain.runPre({})

      expect(order).toEqual([1, 2, 3])
    })

    it('passes document as context (this) to hooks', async () => {
      const chain = new MiddlewareChain('save')
      let capturedThis: unknown

      chain.addPre(async function (this: unknown) {
        capturedThis = this
      })

      // HookContext expects document, query, or model property
      const doc = { name: 'John' }
      await chain.runPre({ document: doc })

      expect(capturedThis).toBe(doc)
    })

    it('handles hook errors', async () => {
      const chain = new MiddlewareChain('save')

      chain.addPre(async function () {
        throw new Error('Hook failed')
      })

      await expect(chain.runPre({})).rejects.toThrow('Hook failed')
    })
  })

  describe('post hooks', () => {
    it('executes post hooks in order', async () => {
      const chain = new MiddlewareChain('save')
      const order: number[] = []

      chain.addPost(async function () {
        order.push(1)
      })
      chain.addPost(async function () {
        order.push(2)
      })

      await chain.runPost({}, null)

      expect(order).toEqual([1, 2])
    })

    it('passes result to post hooks', async () => {
      const chain = new MiddlewareChain('save')
      let capturedResult: unknown

      chain.addPost(async function (result: unknown) {
        capturedResult = result
      })

      await chain.runPost({}, { saved: true })

      expect(capturedResult).toEqual({ saved: true })
    })

    it('handles post hook errors', async () => {
      const chain = new MiddlewareChain('save')

      chain.addPost(async function () {
        throw new Error('Post hook failed')
      })

      await expect(chain.runPost({}, null)).rejects.toThrow('Post hook failed')
    })
  })

  describe('getPreHooks and getPostHooks', () => {
    it('returns registered pre hooks', () => {
      const chain = new MiddlewareChain('save')

      chain.addPre(vi.fn())
      chain.addPre(vi.fn())

      const hooks = chain.getPreHooks()

      expect(hooks.length).toBe(2)
    })

    it('returns registered post hooks', () => {
      const chain = new MiddlewareChain('save')

      chain.addPost(vi.fn())

      const hooks = chain.getPostHooks()

      expect(hooks.length).toBe(1)
    })

    it('returns empty array for unregistered hooks', () => {
      const chain = new MiddlewareChain('save')

      expect(chain.getPreHooks()).toEqual([])
      expect(chain.getPostHooks()).toEqual([])
    })
  })
})

describe('MiddlewareError', () => {
  it('creates error with hook type and phase', () => {
    const error = new MiddlewareError('Test error', 'save', 'pre')

    expect(error.message).toBe('Test error')
    expect(error.hookType).toBe('save')
    expect(error.phase).toBe('pre')
    expect(error.name).toBe('MiddlewareError')
  })

  it('includes original error info', () => {
    const originalError = new Error('Original')
    const error = new MiddlewareError('Wrapped', 'save', 'post', originalError)

    expect(error.originalError).toBe(originalError)
    expect(error.stack).toContain('Caused by')
  })
})

describe('hook type guards', () => {
  describe('isDocumentHook', () => {
    it('returns true for document hooks', () => {
      expect(isDocumentHook('save')).toBe(true)
      expect(isDocumentHook('validate')).toBe(true)
      expect(isDocumentHook('remove')).toBe(true)
      expect(isDocumentHook('init')).toBe(true)
    })

    it('returns false for non-document hooks', () => {
      expect(isDocumentHook('find')).toBe(false)
      expect(isDocumentHook('aggregate')).toBe(false)
    })
  })

  describe('isQueryHook', () => {
    it('returns true for query hooks', () => {
      expect(isQueryHook('find')).toBe(true)
      expect(isQueryHook('findOne')).toBe(true)
      expect(isQueryHook('updateOne')).toBe(true)
      expect(isQueryHook('deleteMany')).toBe(true)
      expect(isQueryHook('findOneAndUpdate')).toBe(true)
    })

    it('returns false for non-query hooks', () => {
      expect(isQueryHook('save')).toBe(false)
      expect(isQueryHook('aggregate')).toBe(false)
    })
  })

  describe('isModelHook', () => {
    it('returns true for model hooks', () => {
      expect(isModelHook('insertMany')).toBe(true)
    })

    it('returns false for non-model hooks', () => {
      expect(isModelHook('save')).toBe(false)
      expect(isModelHook('find')).toBe(false)
    })
  })

  describe('isAggregateHook', () => {
    it('returns true for aggregate hooks', () => {
      expect(isAggregateHook('aggregate')).toBe(true)
    })

    it('returns false for non-aggregate hooks', () => {
      expect(isAggregateHook('find')).toBe(false)
      expect(isAggregateHook('save')).toBe(false)
    })
  })
})
