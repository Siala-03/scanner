import type { Pool } from 'pg';
import cron from 'node-cron';
import {
  selectCodeList,
  selectItemsClass,
  selectBranches,
  selectNotices,
  type EbmConfig,
  type EbmResponse,
} from './ebmService.js';
import { logger } from '../logger.js';

const DEFAULT_LAST_REQ_DT = '20000101000000';

type EndpointKey = 'selectCodeList' | 'selectItemClsList' | 'selectBhfList' | 'selectNoticeList';

interface EndpointDef {
  key: EndpointKey;
  run: (config: EbmConfig, lastReqDt: string) => Promise<EbmResponse>;
}

const ENDPOINTS: EndpointDef[] = [
  { key: 'selectCodeList', run: selectCodeList },
  { key: 'selectItemClsList', run: selectItemsClass },
  { key: 'selectBhfList', run: selectBranches },
  { key: 'selectNoticeList', run: selectNotices },
];

export class OsdcSyncManager {
  constructor(private readonly db: Pool) {}

  private async getConfigs(): Promise<Array<{ restaurant_id: string; tpin: string; bhf_id: string; dvc_srl_no: string; base_url: string }>> {
    const result = await this.db.query(
      `SELECT restaurant_id, tpin, bhf_id, dvc_srl_no, base_url
       FROM ebm_config
       WHERE is_active = true`
    );
    return result.rows;
  }

  private async getLastReqDt(restaurantId: string, endpoint: EndpointKey): Promise<string> {
    const state = await this.db.query(
      `SELECT last_req_dt
       FROM sync_state
       WHERE restaurant_id = $1 AND endpoint = $2
       LIMIT 1`,
      [restaurantId, endpoint]
    );

    return state.rows[0]?.last_req_dt || DEFAULT_LAST_REQ_DT;
  }

  private async markSuccess(restaurantId: string, endpoint: EndpointKey, resultDt?: string): Promise<void> {
    const nextDt = resultDt || DEFAULT_LAST_REQ_DT;
    await this.db.query(
      `INSERT INTO sync_state (restaurant_id, endpoint, last_req_dt, last_result_cd, last_error, last_synced_at, updated_at)
       VALUES ($1, $2, $3, '000', NULL, now(), now())
       ON CONFLICT (restaurant_id, endpoint) DO UPDATE SET
         last_req_dt = EXCLUDED.last_req_dt,
         last_result_cd = EXCLUDED.last_result_cd,
         last_error = NULL,
         last_synced_at = now(),
         updated_at = now()`,
      [restaurantId, endpoint, nextDt]
    );
  }

  private async markFailure(restaurantId: string, endpoint: EndpointKey, code: string, error: string): Promise<void> {
    await this.db.query(
      `INSERT INTO sync_state (restaurant_id, endpoint, last_req_dt, last_result_cd, last_error, last_synced_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now(), now())
       ON CONFLICT (restaurant_id, endpoint) DO UPDATE SET
         last_result_cd = EXCLUDED.last_result_cd,
         last_error = EXCLUDED.last_error,
         last_synced_at = now(),
         updated_at = now()`,
      [restaurantId, endpoint, DEFAULT_LAST_REQ_DT, code, error.slice(0, 2000)]
    );
  }

  private async processData(_endpoint: EndpointKey, _data: unknown): Promise<void> {
    // Placeholder for endpoint-specific persistence as OSDC sync storage evolves.
  }

  async syncEndpoint(config: EbmConfig & { restaurantId: string }, endpoint: EndpointDef): Promise<void> {
    const lastReqDt = await this.getLastReqDt(config.restaurantId, endpoint.key);

    try {
      const response = await endpoint.run(config, lastReqDt);
      if (response.resultCd === '000') {
        await this.markSuccess(config.restaurantId, endpoint.key, response.resultDt || lastReqDt);
        await this.processData(endpoint.key, response.data);
      } else {
        const msg = response.resultMsg || 'Incremental sync failed';
        await this.markFailure(config.restaurantId, endpoint.key, response.resultCd || 'ERR', msg);
        logger.warn('OSDC incremental sync returned non-success', {
          restaurantId: config.restaurantId,
          endpoint: endpoint.key,
          resultCd: response.resultCd,
          resultMsg: response.resultMsg,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.markFailure(config.restaurantId, endpoint.key, 'EXCEPTION', msg);
      logger.error('OSDC incremental sync exception', {
        restaurantId: config.restaurantId,
        endpoint: endpoint.key,
        error: msg,
      });
    }
  }

  async syncAllRestaurants(): Promise<void> {
    const configs = await this.getConfigs();

    for (const cfg of configs) {
      const config: EbmConfig & { restaurantId: string } = {
        restaurantId: cfg.restaurant_id,
        tpin: cfg.tpin,
        bhfId: cfg.bhf_id,
        dvcSrlNo: cfg.dvc_srl_no,
        baseUrl: cfg.base_url,
      };

      for (const endpoint of ENDPOINTS) {
        await this.syncEndpoint(config, endpoint);
      }
    }
  }

  startScheduler(): () => void {
    const task = cron.schedule('*/15 * * * *', () => {
      void this.syncAllRestaurants();
    });

    // Run one pass immediately at startup.
    void this.syncAllRestaurants();

    return () => task.stop();
  }
}
