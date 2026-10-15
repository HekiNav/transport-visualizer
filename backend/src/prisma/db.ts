import 'dotenv/config';
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const db = postgres<Contract>({
  contractJson,
  url: process.env['DATABASE_URL']!,
});
