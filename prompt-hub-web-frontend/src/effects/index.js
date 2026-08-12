// @ts-check
import { backendEffects as backend } from "./backend-effects.mjs";
import { adminEffects as admin } from "./admin-effects.mjs";
import { errorEffects as error } from "./error-effects.mjs";
import { makeServerSyncEffects as makeServerSync } from "./make-server-sync-effects.mjs";
import { makeFailureRecoveryEffects as makeFailureRecovery } from "./make-failure-recovery-effects.mjs";
export const effects = Object.freeze({ backend, admin, error, makeServerSync, makeFailureRecovery });
