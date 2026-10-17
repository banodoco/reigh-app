/** Commands for connecting Astrid App to the sibling Astrid checkout in local development. */
export const ASTRID_LOCAL_RUNTIME_START_COMMAND =
  'astrid-runtime up --profile astrid --data-root "$PWD/../Astrid/.astrid-data"';

export const ASTRID_APP_LOCAL_DEV_COMMAND = 'npm run dev:local';

export const ASTRID_DEMO_BRIDGE_COMMAND = 'npm run dev:editor:bridge';
