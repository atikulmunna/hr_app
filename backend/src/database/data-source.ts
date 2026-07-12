import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.config';

// Loaded by the TypeORM CLI (migrations) and the seed script.
loadEnv();

export const AppDataSource = new DataSource(buildDataSourceOptions());
