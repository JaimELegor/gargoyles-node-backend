declare global {
  namespace Express {
    interface Request {
      user?: {
        githubId: number;
        username: string;
        githubToken: string;
      };
    }
  }
}

export type { FilterDef, FilterParam, FilterParams } from './filter.types.ts';