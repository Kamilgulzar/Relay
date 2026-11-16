import {Client} from 'pg';

export type Statement = {
  sql: string;
  parameters: unknown[];
  all<T>(): Promise<{results: T[]}>;
  first<T>(): Promise<T | null>;
  run(): Promise<{meta: {changes: number}}>;
};

export function postgresDatabase(connectionString: string) {
  async function withClient<T>(work: (client: Client) => Promise<T>) {
    const client = new Client({connectionString, connectionTimeoutMillis: 5000});
    try {
      await client.connect();
      return await work(client);
    } finally {
      await client.end();
    }
  }

  function execute(client: Client, sql: string, parameters: unknown[]) {
    // Relay's internal SQL uses positional placeholders and binds every user value.
    let position = 0;
    return client.query(sql.replace(/\?/g, () => '$' + ++position), parameters);
  }

  return {
    prepare(sql: string) {
      return {
        bind(...parameters: unknown[]): Statement {
          const query = () => withClient(client => execute(client, sql, parameters));
          return {
            sql, parameters,
            async all<T>() {return {results: (await query()).rows as T[]};},
            async first<T>() {return ((await query()).rows[0] as T) ?? null;},
            async run() {return {meta: {changes: (await query()).rowCount ?? 0}};},
          };
        },
      };
    },
    batch(statements: Statement[]) {
      return withClient(async client => {
        await client.query('BEGIN');
        try {
          const results = [];
          for (const {sql, parameters} of statements) {
            const result = await execute(client, sql, parameters);
            results.push({meta: {changes: result.rowCount ?? 0}});
          }
          await client.query('COMMIT');
          return results;
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      });
    },
  };
}
