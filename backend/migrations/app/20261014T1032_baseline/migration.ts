#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/be039af67711986bce295dd1f15a0ea7f75a75eb181518ceda191e6f50143e67/contract';
import endContract from '../../snapshots/be039af67711986bce295dd1f15a0ea7f75a75eb181518ceda191e6f50143e67/contract.json' with { type: 'json' };
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
          col('lat', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('lng', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('messageId', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('timestamp', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('tripId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['messageId'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'Trip',
        columns: [
          col('operatorId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('operatorName', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('route', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('routeType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('tripId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [
          primaryKey(['tripId']),
          checkExpression(
            'Trip_routeType_check_ddc92a03',
            `"routeType" IN ('BUS', 'TRAIN_LONG_DISTANCE', 'TRAIN_COMMUTER', 'TRAM', 'FERRY', 'LIGHT_RAIL')`,
          ),
        ],
      }),
      this.createIndex({
        schema: 'public',
        table: 'Message',
        index: 'Message_tripId_idx_75da6d97',
        columns: ['tripId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Message',
        foreignKey: {
          name: 'Message_tripId_fkey',
          columns: ['tripId'],
          references: { schema: 'public', table: 'Trip', columns: ['tripId'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
