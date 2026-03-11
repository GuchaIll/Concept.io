import dotenv from 'dotenv';

dotenv.config();

export const STAGE: string = process.env.STAGE ?? 'DEV';
export const PORT: number = process.env.PORT ? Number(process.env.PORT) : 5000; 
export const ENV = process.env.ENV ?? 'LOCAL';
export const HOST: string =
  ENV === 'RENDER'
    ? (process.env.RENDER_HOST ?? 'unknown')
    : ENV === 'CODESPACE'
      ? (process.env.CODESPACE_HOST ?? 'unknown')
      : ENV === 'LOCAL'
        ? (process.env.LOCAL_HOST ?? 'unknown')
        : 'unknown';

        
// Database driver: 'postgres' | 'memory'
export const DB_DRIVER: string = process.env.DB_DRIVER ?? 'memory';

// Environment variables for the database