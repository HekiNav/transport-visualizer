#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/8bedf970ba24bb0848d0afbd6a4bee19fac531ad45a5e9b3b380c4e87ce12121/contract';
import endContract from '../../snapshots/8bedf970ba24bb0848d0afbd6a4bee19fac531ad45a5e9b3b380c4e87ce12121/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  checkExpression,
  col,
  primaryKey,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'Message',
        columns: [
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('operator', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('route', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('routeType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('timestamp', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [
          primaryKey(['id']),
          checkExpression(
            'Message_routeType_check_ddc92a03',
            `"routeType" IN ('BUS', 'TRAIN_LONG_DISTANCE', 'TRAIN_COMMUTER', 'TRAM', 'FERRY', 'LIGHT_RAIL')`,
          ),
        ],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
