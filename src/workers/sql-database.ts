import type { SqlDatabase, SqlValue } from '../auth/sql-store.js';

/** Driver adapter only: SQL executes on the object's persistent database. */
export class DurableSqlDatabase implements SqlDatabase {
  constructor(private readonly sql: SqlStorage) {}
  exec(query: string): void { this.sql.exec(query).toArray(); }
  prepare(query: string) {
    return {
      get: (...values: SqlValue[]) => this.sql.exec(query, ...values).toArray()[0],
      all: (...values: SqlValue[]) => this.sql.exec(query, ...values).toArray(),
      run: (...values: SqlValue[]) => {
        this.sql.exec(query, ...values).toArray();
        // rowsWritten counts index writes and is unsuitable for replay checks.
        return { changes: this.sql.exec<{ n: number }>('SELECT changes() AS n').one().n };
      },
    };
  }
  close(): void { /* The platform owns the database connection. */ }
}
