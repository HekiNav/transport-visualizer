#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5e3c98f1b43b89bb1b4003e0ff554d17ffa79a66a028f642357bb85769c2e269/contract';
import startContract from '../../snapshots/5e3c98f1b43b89bb1b4003e0ff554d17ffa79a66a028f642357bb85769c2e269/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/70782d8c0265277aff5e8e5ff8bcb0803ecad032af2b4f3c98af1d27f862113e/contract';
import endContract from '../../snapshots/70782d8c0265277aff5e8e5ff8bcb0803ecad032af2b4f3c98af1d27f862113e/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, sql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Trip',
        constraint: 'Trip_dataSource_check_3ec7359e',
      }),
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Trip',
        constraint: 'Trip_routeType_check_b6410f7b',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Trip',
        constraint: 'Trip_dataSource_check_4b5961a8',
        expression: sql`"dataSource" IN ('DIGITRAFFIC', 'HSL')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Trip',
        constraint: 'Trip_routeType_check_9a0814b0',
        expression: sql`"routeType" IN ('BUS', 'TRAIN_LONG_DISTANCE', 'TRAIN_COMMUTER', 'TRAIN_FREIGHT', 'TRAIN_SHUNT', 'TRAIN_OTHER', 'TRAIN_REGIONAL', 'TRAIN_TRANSFER', 'TRAIN_SLEEPER', 'TRAM', 'FERRY', 'LIGHT_RAIL', 'METRO')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
