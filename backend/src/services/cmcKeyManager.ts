import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Pool } from 'pg';

const ALGO = 'aes-256-gcm';
const KEY_BYTES = 32;

function getMasterKey(): Buffer {
  const raw = process.env.OSDC_MASTER_KEY;
  if (!raw) {
    throw new Error('OSDC_MASTER_KEY is required to encrypt device keys');
  }

  const key = Buffer.from(raw, 'hex');
  if (key.length !== KEY_BYTES) {
    throw new Error('OSDC_MASTER_KEY must be a 32-byte hex string');
  }

  return key;
}

function encryptValue(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, getMasterKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptValue(value: string): string {
  const [ivHex, tagHex, encryptedHex] = value.split(':');
  if (!ivHex || !tagHex || !encryptedHex) {
    throw new Error('Invalid encrypted CMC key format');
  }

  const decipher = createDecipheriv(ALGO, getMasterKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export interface DeviceKeyRecord {
  restaurant_id: string;
  tin: string;
  bhf_id: string;
  dvc_srl_no: string;
  cmc_key_enc: string;
  expires_at: string;
  rotated_at: string | null;
}

export class CmcKeyManager {
  constructor(private readonly db: Pool) {}

  encrypt(key: string): string {
    return encryptValue(key);
  }

  decrypt(data: string): string {
    return decryptValue(data);
  }

  private async fetchOsdcKey(tin: string, bhfId: string, serial: string): Promise<string> {
    if (!process.env.OSDC_URL) {
      throw new Error('OSDC_URL is required for CMC key rotation');
    }

    const response = await fetch(`${process.env.OSDC_URL}/selectInitOsdcInfo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tin, bhfId, dvcSrlNo: serial }),
    });

    const json = await response.json();
    if (json.resultCd !== '000') {
      throw new Error(`OSDC Auth Failed: ${json.resultCd}`);
    }

    const newKey = String(json?.data?.info?.cmcKey || '');
    if (!newKey) {
      throw new Error('OSDC Auth Failed: cmcKey missing in response');
    }

    return newKey;
  }

  private async upsertKey(
    restaurantId: string,
    tin: string,
    bhfId: string,
    serial: string,
    encryptedKey: string,
    existingEncryptedKey?: string | null,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO device_keys (restaurant_id, tin, bhf_id, dvc_srl_no, cmc_key_enc, expires_at, rotated_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '90 days', CASE WHEN $6 IS NULL THEN NULL ELSE now() END, now())
       ON CONFLICT (restaurant_id, tin, bhf_id) DO UPDATE SET
         dvc_srl_no = EXCLUDED.dvc_srl_no,
         cmc_key_enc = EXCLUDED.cmc_key_enc,
         expires_at = EXCLUDED.expires_at,
         rotated_at = now(),
         updated_at = now()`,
      [restaurantId, tin, bhfId, serial, encryptedKey, existingEncryptedKey ?? null]
    );
  }

  async rotateKey(restaurantId: string, tin: string, bhfId: string, serial: string): Promise<string> {
    const row = await this.db.query<DeviceKeyRecord>(
      `SELECT cmc_key_enc
       FROM device_keys
       WHERE restaurant_id = $1 AND tin = $2 AND bhf_id = $3
       LIMIT 1`,
      [restaurantId, tin, bhfId]
    );
    const existing = row.rows[0];

    const newKey = await this.fetchOsdcKey(tin, bhfId, serial);
    const encrypted = encryptValue(newKey);
    await this.upsertKey(restaurantId, tin, bhfId, serial, encrypted, existing?.cmc_key_enc ?? null);

    return newKey;
  }

  async getActiveKey(restaurantId: string, tin: string, bhfId: string, serial: string): Promise<string> {
    const row = await this.db.query<DeviceKeyRecord>(
      `SELECT restaurant_id, tin, bhf_id, dvc_srl_no, cmc_key_enc, expires_at, rotated_at
       FROM device_keys
       WHERE restaurant_id = $1 AND tin = $2 AND bhf_id = $3
       LIMIT 1`,
      [restaurantId, tin, bhfId]
    );

    const existing = row.rows[0];
    if (existing && new Date(existing.expires_at) > new Date()) {
      return decryptValue(existing.cmc_key_enc);
    }

    return this.rotateKey(restaurantId, tin, bhfId, serial);
  }
}
