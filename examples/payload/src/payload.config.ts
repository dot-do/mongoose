import { buildConfig } from 'payload'
import { mondooAdapter } from './db/adapter'
import { Users, Posts } from './collections'

export default buildConfig({
  collections: [Users, Posts],
  db: mondooAdapter(),
  secret: process.env.PAYLOAD_SECRET || 'super-secret-key-change-in-production',
  typescript: {
    outputFile: './payload-types.ts',
  },
})
