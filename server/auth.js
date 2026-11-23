import {createHash, randomBytes, scryptSync, timingSafeEqual} from 'node:crypto'

export const token = () => randomBytes(24).toString('base64url')
export const digest = value => createHash('sha256').update(value).digest('hex')

export function hashCode(code) {
  const salt = randomBytes(16).toString('hex')
  return salt + ':' + scryptSync(code, salt, 32).toString('hex')
}

export function matches(code, hash) {
  if (!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(hash ?? '')) return false
  const [salt, value] = hash.split(':')
  return timingSafeEqual(scryptSync(code, salt, 32), Buffer.from(value, 'hex'))
}
