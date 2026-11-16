import {DatabaseSync} from 'node:sqlite';
import {Client} from 'pg';

const sourcePath = process.argv[2];
const connectionString = process.env.POSTGRES_URL;
if (!sourcePath || !connectionString) {
  console.error('Set POSTGRES_URL and pass the path to the local D1 SQLite database.');
  process.exit(1);
}

const tables = ['workspaces', 'accounts', 'members', 'records', 'auth_settings',
  'account_invites', 'sessions', 'auth_throttle'];
const source = new DatabaseSync(sourcePath, {readOnly: true});
const target = new Client({connectionString});
try {
  source.exec('BEGIN');
  await target.connect();
  await target.query('BEGIN');
  try {
    await target.query('LOCK TABLE ' + tables.join(', ') + ' IN ACCESS EXCLUSIVE MODE');
    for (const table of tables) {
      const {rowCount} = await target.query('SELECT 1 FROM ' + table + ' LIMIT 1');
      if (rowCount) throw new Error('The target database already contains Relay data.');
    }
    // Users sign in again and can request new invitation/reset links after migration.
    for (const table of tables.slice(0, 5)) {
      const select = source.prepare('SELECT * FROM ' + table);
      const columns = select.columns().map(column => '"' + column.name.replaceAll('"', '""') + '"');
      const placeholders = columns.map((_, index) => '$' + (index + 1));
      const insert = 'INSERT INTO ' + table + ' (' + columns.join(',') +
        ') VALUES (' + placeholders.join(',') + ')';
      for (const row of select.iterate()) await target.query(insert, Object.values(row));
    }
    await target.query('COMMIT');
    console.log('Imported Relay accounts, workspaces, members, records and setup state.');
  } catch (error) {
    await target.query('ROLLBACK');
    throw error;
  }
} catch (error) {
  console.error('Import failed:', error.code || error.message);
  process.exitCode = 1;
} finally {
  source.close();
  await target.end();
}
