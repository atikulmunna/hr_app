import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.config';

// Loaded by the TypeORM CLI (migrations) and the seed script.
// quiet: dotenv 17 started logging a line on every load; these are CLI
// entry points whose own output should stay the only thing they print.
loadEnv({ quiet: true });

export const AppDataSource = new DataSource(buildDataSourceOptions());
