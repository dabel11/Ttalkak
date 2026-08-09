// @ts-check
import "./backend-effects.js";
import "./admin-effects.js";
import "./error-effects.js";
import "./make-server-sync-effects.js";
import "./make-failure-recovery-effects.js";
export const effects = Object.freeze({ backend: window.TtalkakBackendEffects, admin: window.TtalkakAdminEffects, error: window.TtalkakErrorEffects, makeServerSync: window.TtalkakMakeServerSyncEffects, makeFailureRecovery: window.TtalkakMakeFailureRecoveryEffects });
