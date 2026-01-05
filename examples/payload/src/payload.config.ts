import { buildConfig } from 'payload'
import { mongooseAdapter } from './db/adapter'
import { Users, Posts } from './collections'

export default buildConfig({
  collections: [Users, Posts],
  db: mongooseAdapter(),
  secret: process.env.PAYLOAD_SECRET || 'super-secret-key-change-in-production',
  typescript: {
    outputFile: './payload-types.ts',
  },
})
