import 'server-only'
import crypto from 'node:crypto'
const secret=()=>{const v=process.env.ANAIRA_SECRET_KEY||process.env.ANAIRA_SECRET;if(!v)throw new Error('ANAIRA_SECRET_KEY is required');return crypto.createHash('sha256').update(v).digest()}
export const seal=v=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',secret(),iv);const e=Buffer.concat([c.update(String(v),'utf8'),c.final()]);return [iv.toString('base64'),c.getAuthTag().toString('base64'),e.toString('base64')].join('.')}
export const open=v=>{const [i,t,e]=String(v).split('.');if(!i||!t||!e)throw new Error('Invalid encrypted integration secret');const d=crypto.createDecipheriv('aes-256-gcm',secret(),Buffer.from(i,'base64'));d.setAuthTag(Buffer.from(t,'base64'));return Buffer.concat([d.update(Buffer.from(e,'base64')),d.final()]).toString('utf8')}
