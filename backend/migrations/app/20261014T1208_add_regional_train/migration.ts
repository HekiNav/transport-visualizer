#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/ae4ce492fc31559b76d87e9f52ee9c2fdfbfa23cc08d9f5aa3917daf745830a6/contract';
import endContract from '../../snapshots/ae4ce492fc31559b76d87e9f52ee9c2fdfbfa23cc08d9f5aa3917daf745830a6/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/be039af67711986bce295dd1f15a0ea7f75a75eb181518ceda191e6f50143e67/contract';
import startContract from '../../snapshots/be039af67711986bce295dd1f15a0ea7f75a75eb181518ceda191e6f50143e67/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, placeholder } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.dropCheckConstraint({
        schema: 'public',
        table: 'Trip',
        constraint: 'Trip_routeType_check_ddc92a03',
      }),
      this.addColumn({
        schema: 'public',
        table: 'Trip',
        column: col('endPointName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Trip',
        column: col('startPointName', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Trip',
        column: col('dataSource', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.dataTransform(endContract, 'backfill-Trip-dataSource', {
        check: () => placeholder('backfill-Trip-dataSource:check'),
        run: () => placeholder('backfill-Trip-dataSource:run'),
      }),
      this.setNotNull({ schema: 'public', table: 'Trip', column: 'dataSource' }),
      this.addColumn({
        schema: 'public',
        table: 'Trip',
        column: col('endPointId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.dataTransform(endContract, 'backfill-Trip-endPointId', {
        check: () => placeholder('backfill-Trip-endPointId:check'),
        run: () => placeholder('backfill-Trip-endPointId:run'),
      }),
      this.setNotNull({ schema: 'public', table: 'Trip', column: 'endPointId' }),
      this.addColumn({
        schema: 'public',
        table: 'Trip',
        column: col('startPointId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.dataTransform(endContract, 'backfill-Trip-startPointId', {
        check: () => placeholder('backfill-Trip-startPointId:check'),
        run: () => placeholder('backfill-Trip-startPointId:run'),
      }),
      this.setNotNull({ schema: 'public', table: 'Trip', column: 'startPointId' }),
      this.dropNotNull({ schema: 'public', table: 'Trip', column: 'operatorName' }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Trip',
        constraint: 'Trip_dataSource_check_3ec7359e',
        expression: `"dataSource" IN ('DIGITRAFFIC')`,
      }),
      this.addCheckConstraint({
        schema: 'public',
        table: 'Trip',
        constraint: 'Trip_routeType_check_1919e709',
        expression: `"routeType" IN ('BUS', 'TRAIN_LONG_DISTANCE', 'TRAIN_COMMUTER', 'TRAIN_FREIGHT', 'TRAIN_LOCOMOTIVE', 'TRAIN_SHUNT', 'TRAIN_OTHER', 'TRAIN_REGIONAL', 'TRAM', 'FERRY', 'LIGHT_RAIL')`,
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
