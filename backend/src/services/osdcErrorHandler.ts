import { logger } from '../logger.js';

export type OsdcAction = 'COMMIT' | 'SKIP' | 'FAIL' | 'RETRY' | 'REAUTH' | 'HOLD';

interface ErrorRule {
  action: OsdcAction;
  msg: string;
}

export const ERROR_ACTIONS: Record<string, ErrorRule> = {
  '000': { action: 'COMMIT', msg: 'Success' },
  '001': { action: 'SKIP', msg: 'No new data' },
  '891': { action: 'FAIL', msg: 'Invalid URL' },
  '894': { action: 'RETRY', msg: 'Network error' },
  '901': { action: 'REAUTH', msg: 'Invalid device' },
  '921': { action: 'HOLD', msg: 'Sales data rejected' },
  '999': { action: 'RETRY', msg: 'Server error' },
};

interface HandleOsdcResponseOptions {
  onCommit?: () => Promise<void>;
  onSkip?: () => Promise<void>;
  onRetry?: () => Promise<void>;
  onReauth?: () => Promise<void>;
  onHold?: () => Promise<void>;
  onFail?: () => Promise<void>;
  alertAdmin?: (message: string) => Promise<void>;
}

export async function handleOsdcResponse(
  code: string,
  payload: unknown,
  txId: string,
  options: HandleOsdcResponseOptions = {},
): Promise<OsdcAction> {
  const rule = ERROR_ACTIONS[code] || { action: 'RETRY' as const, msg: `Unknown: ${code}` };

  if (code !== '000') {
    logger.error(`OSDC ${code}: ${rule.msg}`, { txId, payload });
  }

  switch (rule.action) {
    case 'COMMIT':
      if (options.onCommit) await options.onCommit();
      break;
    case 'SKIP':
      if (options.onSkip) await options.onSkip();
      break;
    case 'RETRY':
      if (options.onRetry) await options.onRetry();
      break;
    case 'REAUTH':
      if (options.onReauth) await options.onReauth();
      break;
    case 'HOLD':
      if (options.onHold) await options.onHold();
      if (options.alertAdmin) {
        await options.alertAdmin(`RRA blocked transaction ${txId} with code ${code}`);
      }
      break;
    default:
      if (options.onFail) await options.onFail();
      break;
  }

  return rule.action;
}
