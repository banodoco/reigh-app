import { webcrypto } from 'node:crypto';

export const crypto = globalThis.crypto ?? webcrypto;
