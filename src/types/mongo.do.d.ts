/**
 * Type declarations for mongo.do
 * This is a placeholder until the mongo.do package provides its own types
 */
declare module 'mongo.do' {
  /**
   * MongoDB ObjectId type
   */
  export interface ObjectId {
    toString(): string
    toHexString(): string
    equals(otherId: ObjectId | string): boolean
    getTimestamp(): Date
  }

  /**
   * Create a new ObjectId
   */
  export function ObjectId(id?: string | ObjectId): ObjectId

  /**
   * Check if a value is a valid ObjectId
   */
  export function isValidObjectId(id: unknown): boolean
}
