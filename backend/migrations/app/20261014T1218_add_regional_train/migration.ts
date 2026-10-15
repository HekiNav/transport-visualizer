#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/28069dde443dc8d62d661823cc2eb4f297f6e15d6166cf396c4a4ab52d4d7aad/contract';
import endContract from '../../snapshots/28069dde443dc8d62d661823cc2eb4f297f6e15d6166cf396c4a4ab52d4d7aad/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/6ad0db091052ef9b67d453e2c3e93000653eeb5b3e2585c72aa430aff204f15b/contract';
import startContract from '../../snapshots/6ad0db091052ef9b67d453e2c3e93000653eeb5b3e2585c72aa430aff204f15b/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Trip',
        constraint: 'Trip_routeType_check_e60f2168',
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Trip',
        constraint: 'Trip_routeType_check_b6410f7b',
        expression: `"routeType" IN ('BUS', 'TRAIN_LONG_DISTANCE', 'TRAIN_COMMUTER', 'TRAIN_FREIGHT', 'TRAIN_SHUNT', 'TRAIN_OTHER', 'TRAIN_REGIONAL', 'TRAIN_TRANSFER', 'TRAIN_SLEEPER', 'TRAM', 'FERRY', 'LIGHT_RAIL')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
