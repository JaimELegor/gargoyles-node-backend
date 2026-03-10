import { Router } from 'express';
import { FilterController } from '../controllers/FilterController';
import { authenticateToken } from '../middleware/auth';

export class FilterRouter {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initRoutes();
  }

  private initRoutes(): void {
    this.router.post('/submit', authenticateToken, FilterController.submitFilter);
    this.router.post('/test/pr', authenticateToken, FilterController.submitFilter); // Test route
  }
}