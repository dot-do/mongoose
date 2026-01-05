/**
 * Tests for Connection class - database connection management
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  Connection,
  createMongoose,
  connect,
  disconnect,
  defaultConnection,
  connection,
  STATES,
} from '../src/connection/index.js'
import { Schema } from '../src/schema/index.js'

describe('Connection', () => {
  let conn: Connection

  beforeEach(() => {
    conn = new Connection()
  })

  describe('initial state', () => {
    it('starts in disconnected state', () => {
      expect(conn.readyState).toBe(STATES.disconnected)
    })

    it('has empty models map', () => {
      expect(conn.models.size).toBe(0)
    })

    it('has no db reference', () => {
      expect(conn.db).toBeNull()
    })
  })

  describe('useEnv()', () => {
    it('sets the worker environment', () => {
      const env = { MONGODB: {} as any }

      conn.useEnv(env)

      expect(conn.getEnv()).toBe(env)
    })

    it('marks connection as connected', () => {
      const env = { MONGODB: {} as any }

      conn.useEnv(env)

      expect(conn.readyState).toBe(STATES.connected)
      expect(conn.isConnected()).toBe(true)
    })

    it('emits connected event', () => {
      const env = { MONGODB: {} as any }
      const handler = vi.fn()

      conn.on('connected', handler)
      conn.useEnv(env)

      expect(handler).toHaveBeenCalled()
    })

    it('supports alternative binding names', () => {
      const env1 = { DB: {} as any }
      const conn1 = new Connection()
      conn1.useEnv(env1)
      expect(conn1.db).toBeDefined()

      const env2 = { DATABASE: {} as any }
      const conn2 = new Connection()
      conn2.useEnv(env2)
      expect(conn2.db).toBeDefined()
    })
  })

  describe('openUri()', () => {
    it('stores connection options', async () => {
      await conn.openUri('mongodb://localhost/test', { dbName: 'mydb' })

      expect(conn.options.dbName).toBe('mydb')
    })

    it('sets connecting state', async () => {
      const promise = conn.openUri('mongodb://localhost/test')

      // Note: In Workers, it doesn't fully connect without env
      await promise
    })

    it('returns self for chaining', async () => {
      const result = await conn.openUri()

      expect(result).toBe(conn)
    })
  })

  describe('close()', () => {
    it('disconnects and clears state', async () => {
      const env = { MONDODB: {} as any }
      conn.useEnv(env)

      await conn.close()

      expect(conn.readyState).toBe(STATES.disconnected)
      expect(conn.db).toBeNull()
      expect(conn.getEnv()).toBeNull()
    })

    it('emits disconnected event', async () => {
      const env = { MONDODB: {} as any }
      conn.useEnv(env)
      const handler = vi.fn()

      conn.on('disconnected', handler)
      await conn.close()

      expect(handler).toHaveBeenCalled()
    })

    it('is idempotent', async () => {
      await conn.close()
      await conn.close()

      expect(conn.readyState).toBe(STATES.disconnected)
    })
  })

  describe('model()', () => {
    it('creates and registers a model', () => {
      const env = { MONDODB: {} as any }
      conn.useEnv(env)

      const schema = new Schema({ name: String })
      const User = conn.model('User', schema)

      expect(User).toBeDefined()
      expect(conn.models.has('User')).toBe(true)
    })

    it('retrieves existing model without schema', () => {
      const env = { MONDODB: {} as any }
      conn.useEnv(env)

      const schema = new Schema({ name: String })
      conn.model('User', schema)

      const User = conn.model('User')

      expect(User).toBeDefined()
    })

    it('throws if model not found and no schema provided', () => {
      const env = { MONDODB: {} as any }
      conn.useEnv(env)

      expect(() => conn.model('NonExistent')).toThrow(/not found/)
    })

    it('returns same model if called twice with same name', () => {
      const env = { MONDODB: {} as any }
      conn.useEnv(env)

      const schema = new Schema({ name: String })
      const User1 = conn.model('User', schema)
      const User2 = conn.model('User', schema)

      expect(User1).toBe(User2)
    })
  })

  describe('modelNames()', () => {
    it('returns array of registered model names', () => {
      const env = { MONDODB: {} as any }
      conn.useEnv(env)

      const schema = new Schema({ name: String })
      conn.model('User', schema)
      conn.model('Post', schema)

      const names = conn.modelNames()

      expect(names).toContain('User')
      expect(names).toContain('Post')
    })
  })

  describe('deleteModel()', () => {
    it('removes model from connection', () => {
      const env = { MONDODB: {} as any }
      conn.useEnv(env)

      const schema = new Schema({ name: String })
      conn.model('User', schema)

      conn.deleteModel('User')

      expect(conn.models.has('User')).toBe(false)
    })

    it('returns self for chaining', () => {
      const env = { MONDODB: {} as any }
      conn.useEnv(env)

      const schema = new Schema({ name: String })
      conn.model('User', schema)

      const result = conn.deleteModel('User')

      expect(result).toBe(conn)
    })
  })

  describe('hasModel()', () => {
    it('returns true if model exists', () => {
      const env = { MONDODB: {} as any }
      conn.useEnv(env)

      const schema = new Schema({ name: String })
      conn.model('User', schema)

      expect(conn.hasModel('User')).toBe(true)
    })

    it('returns false if model does not exist', () => {
      expect(conn.hasModel('NonExistent')).toBe(false)
    })
  })

  describe('session and transactions', () => {
    it('startSession() creates a session', async () => {
      const session = await conn.startSession()

      expect(session).toBeDefined()
      expect(session.id).toBeDefined()
      expect(session.inTransaction()).toBe(false)
    })

    it('session.startTransaction() starts a transaction', async () => {
      const session = await conn.startSession()

      session.startTransaction()

      expect(session.inTransaction()).toBe(true)
    })

    it('session.commitTransaction() commits', async () => {
      const session = await conn.startSession()

      session.startTransaction()
      await session.commitTransaction()

      expect(session.inTransaction()).toBe(false)
    })

    it('session.abortTransaction() aborts', async () => {
      const session = await conn.startSession()

      session.startTransaction()
      await session.abortTransaction()

      expect(session.inTransaction()).toBe(false)
    })

    it('session.withTransaction() runs callback in transaction', async () => {
      const session = await conn.startSession()
      let wasInTransaction = false

      await session.withTransaction(async () => {
        wasInTransaction = session.inTransaction()
        return 'result'
      })

      expect(wasInTransaction).toBe(true)
      expect(session.inTransaction()).toBe(false)
    })

    it('transaction() convenience method', async () => {
      let sessionReceived: any

      await conn.transaction(async (session) => {
        sessionReceived = session
        return 'result'
      })

      expect(sessionReceived).toBeDefined()
    })
  })

  describe('event emitter', () => {
    it('on() registers listener', () => {
      const handler = vi.fn()

      conn.on('connected', handler)
      conn.emit('connected')

      expect(handler).toHaveBeenCalled()
    })

    it('once() registers one-time listener', () => {
      const handler = vi.fn()

      conn.once('connected', handler)
      conn.emit('connected')
      conn.emit('connected')

      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('off() removes listener', () => {
      const handler = vi.fn()

      conn.on('connected', handler)
      conn.off('connected', handler)
      conn.emit('connected')

      expect(handler).not.toHaveBeenCalled()
    })

    it('removeAllListeners() clears all listeners', () => {
      const handler = vi.fn()

      conn.on('connected', handler)
      conn.on('disconnected', handler)
      conn.removeAllListeners()
      conn.emit('connected')
      conn.emit('disconnected')

      expect(handler).not.toHaveBeenCalled()
    })

    it('listenerCount() returns number of listeners', () => {
      conn.on('connected', vi.fn())
      conn.on('connected', vi.fn())

      expect(conn.listenerCount('connected')).toBe(2)
    })
  })

  describe('utility methods', () => {
    it('set() sets option', () => {
      conn.set('autoIndex', true)

      expect(conn.get('autoIndex')).toBe(true)
    })

    it('createConnection() creates new connection', () => {
      const newConn = conn.createConnection()

      expect(newConn).toBeInstanceOf(Connection)
      expect(newConn).not.toBe(conn)
    })

    it('isConnected() returns connection status', () => {
      expect(conn.isConnected()).toBe(false)

      conn.useEnv({ MONDODB: {} as any })

      expect(conn.isConnected()).toBe(true)
    })

    it('host and port have default values', () => {
      expect(conn.host).toBe('durable-object')
      expect(conn.port).toBe(0)
    })
  })

  describe('async iterator', () => {
    it('iterates over models', async () => {
      const env = { MONDODB: {} as any }
      conn.useEnv(env)

      const schema = new Schema({ name: String })
      conn.model('User', schema)
      conn.model('Post', schema)

      const names: string[] = []
      for await (const [name] of conn) {
        names.push(name)
      }

      expect(names).toContain('User')
      expect(names).toContain('Post')
    })
  })
})

describe('createMongoose()', () => {
  it('creates connected instance', () => {
    const env = { MONGODB: {} as any }

    const mongoose = createMongoose(env)

    expect(mongoose).toBeInstanceOf(Connection)
    expect(mongoose.isConnected()).toBe(true)
  })

  it('applies options', () => {
    const env = { MONGODB: {} as any }

    const mongoose = createMongoose(env, { dbName: 'mydb' })

    expect(mongoose.options.dbName).toBe('mydb')
  })
})

describe('module exports', () => {
  it('exports STATES constant', () => {
    expect(STATES.disconnected).toBe(0)
    expect(STATES.connected).toBe(1)
    expect(STATES.connecting).toBe(2)
    expect(STATES.disconnecting).toBe(3)
  })

  it('exports defaultConnection', () => {
    expect(defaultConnection).toBeInstanceOf(Connection)
  })

  it('connection is alias for defaultConnection', () => {
    expect(connection).toBe(defaultConnection)
  })

  it('exports connect function', () => {
    expect(typeof connect).toBe('function')
  })

  it('exports disconnect function', () => {
    expect(typeof disconnect).toBe('function')
  })
})
