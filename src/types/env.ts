export const AppEnv = {
  DEV: 'dev',
  LOCAL: 'local',
  WEB: 'web',
} as const;

export type AppEnvValue = typeof AppEnv[keyof typeof AppEnv];

const LOCAL_ENVS: AppEnvValue[] = [AppEnv.LOCAL]; 