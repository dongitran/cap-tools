import { prepareCfCliSession, runWithCfTarget } from './cfClient';
import { isRecoverableCfCliAuthError } from './cfCliAuthError';

export { isRecoverableCfCliAuthError } from './cfCliAuthError';

const CF_CLI_AUTH_RECOVERY_RETRIES = 2;

export interface CfCliAuthRecoverySession {
  readonly apiEndpoint: string;
  readonly email: string;
  readonly password: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly cfHomeDir?: string;
}

export interface CfCliAuthRecoveryOptions {
  /**
   * Hold the CF_HOME slot across the operation so nothing can retarget between
   * `cf target` and the operation's own `cf` commands.
   *
   * Off by default, and deliberately so: the slot is global to the CF_HOME, and
   * a long operation (an artifact export runs a series of `cf ssh` calls) would
   * stall every other CF-backed feature for its whole duration. Turn it on only
   * for short operations whose result depends on the targeted scope — resolving
   * service credentials being the case that matters, since a wrong target there
   * silently yields another org's database.
   */
  readonly holdTarget?: boolean;
}

export async function runWithCfCliAuthRecovery<T>(
  session: CfCliAuthRecoverySession,
  operation: () => Promise<T>,
  options: CfCliAuthRecoveryOptions = {}
): Promise<T> {
  let lastError: unknown = null;
  for (let retryIndex = 0; retryIndex <= CF_CLI_AUTH_RECOVERY_RETRIES; retryIndex += 1) {
    const params = buildSessionParams(session, retryIndex > 0);
    try {
      if (options.holdTarget === true) {
        return await runWithCfTarget(params, operation);
      }
      await prepareCfCliSession(params);
      return await operation();
    } catch (error) {
      lastError = error;
      if (!shouldRetryCfCliAuth(error, retryIndex)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Cloud Foundry CLI operation failed.');
}

function shouldRetryCfCliAuth(error: unknown, retryIndex: number): boolean {
  return (
    retryIndex < CF_CLI_AUTH_RECOVERY_RETRIES &&
    isRecoverableCfCliAuthError(error)
  );
}

function buildSessionParams(
  session: CfCliAuthRecoverySession,
  forceReauth: boolean
): {
  readonly apiEndpoint: string;
  readonly email: string;
  readonly password: string;
  readonly orgName: string;
  readonly spaceName: string;
  readonly cfHomeDir?: string;
  readonly forceReauth?: boolean;
} {
  const base = {
    apiEndpoint: session.apiEndpoint,
    email: session.email,
    password: session.password,
    orgName: session.orgName,
    spaceName: session.spaceName,
    ...(session.cfHomeDir === undefined ? {} : { cfHomeDir: session.cfHomeDir }),
  };
  return forceReauth ? { ...base, forceReauth: true } : base;
}
