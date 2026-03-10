import { Router } from 'express';
import { AuthController } from '../controllers/AuthController';

export class AuthRouter {
  public router: Router;

  constructor() {
    this.router = Router();
    this.initRoutes();
  }

  private initRoutes(): void {
    this.router.get('/github', AuthController.githubAuthRedirect);
    this.router.get('/github/callback', AuthController.githubCallback);
    this.router.get("/exchange", AuthController.exchange);
  }
}