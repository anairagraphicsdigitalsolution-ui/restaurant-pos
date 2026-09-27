import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const srcUrl = process.env.SUPABASE_REMOTE_URL
const srcKey = process.env.SUPABASE_REMOTE_SERVICE_ROLE_KEY
const localUrl = process.env.SUPABASE_LOCAL_URL || 'http://127.0.0.1:8000'
const localKey = process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY
const out = process.env.ANAIRA_STORAGE_MIRROR_DIR || path.resolve('.anaira-storage-mirror')
if (!srcUrl || !srcKey || !localKey) throw new Error('SUPABASE_REMOTE_URL, SUPABASE_REMOTE_SERVICE_ROLE_KEY and SUPABASE_LOCAL_SERVICE_ROLE_KEY are required')
const src = createClient(srcUrl, srcKey)
const dst = createClient(localUrl, localKey)
await fs.mkdir(out, { recursive: true })
const { data: buckets, error: be } = await src.storage.listBuckets()
if (be) throw be
for (const bucket of buckets || []) {
  const { data: objects, error } = await src.storage.from(bucket.id).list('', { limit: 10000 })
  if (error) throw error
  for (const obj of objects || []) {
    if (!obj.name || obj.id === undefined && obj.metadata === undefined) continue
    const full = `${bucket.id}/${obj.name}`
    const { data: file, error: de } = await src.storage.from(bucket.id).download(obj.name)
    if (de) throw de
    const buf = Buffer.from(await file.arrayBuffer())
    const tmp = path.join(out, full.replaceAll('/', '__'))
    await fs.writeFile(tmp, buf)
    const { error: ue } = await dst.storage.from(bucket.id).upload(obj.name, buf, { upsert: true, contentType: obj.metadata?.mimetype || 'application/octet-stream' })
    if (ue) throw ue
    console.log('synced', full)
  }
}
console.log('Storage migration finished')
