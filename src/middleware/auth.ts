import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

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


export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.slice(7); // Remove 'Bearer '

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET!) as any;
  // Cleanup old tokens (run every hour)
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
}