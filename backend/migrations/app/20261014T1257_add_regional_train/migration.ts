#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/28069dde443dc8d62d661823cc2eb4f297f6e15d6166cf396c4a4ab52d4d7aad/contract';
import startContract from '../../snapshots/28069dde443dc8d62d661823cc2eb4f297f6e15d6166cf396c4a4ab52d4d7aad/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5e3c98f1b43b89bb1b4003e0ff554d17ffa79a66a028f642357bb85769c2e269/contract';
import endContract from '../../snapshots/5e3c98f1b43b89bb1b4003e0ff554d17ffa79a66a028f642357bb85769c2e269/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, placeholder } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Trip',
        column: col('departureDate', 'date', { codecRef: { codecId: 'pg/date-temporal@1' } }),
      }),
      this.dataTransform(endContract, 'backfill-Trip-departureDate', {
        check: () => placeholder('backfill-Trip-departureDate:check'),
        run: () => placeholder('backfill-Trip-departureDate:run'),
      }),
      this.setNotNull({ schema: 'public', table: 'Trip', column: 'departureDate' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
