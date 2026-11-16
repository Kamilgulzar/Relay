import {env as bindings} from 'cloudflare:workers';

const workerEnv = bindings as typeof bindings & {
  POSTGRES_URL?: string;
  RELAY_SETUP_TOKEN?: string;
  HYPERDRIVE?: {connectionString: string};
};

export const env = {
  get DB() {return workerEnv.DB;},
  get POSTGRES_URL() {return workerEnv.POSTGRES_URL;},
  get RELAY_SETUP_TOKEN() {return workerEnv.RELAY_SETUP_TOKEN;},
  get HYPERDRIVE() {return workerEnv.HYPERDRIVE;},
  get BUCKET() {
    const bucket = workerEnv.BUCKET;
    if (!bucket) return undefined;
    return {
      put: (key: string, file: File) => bucket.put(key, file.stream(), {
        httpMetadata: {contentType: 'application/octet-stream'},
      }),
      get: (key: string) => bucket.get(key),
      delete: (key: string) => bucket.delete(key),
    };
  },
};

