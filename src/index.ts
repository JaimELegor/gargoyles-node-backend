import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { AuthRouter } from './routes/AuthRouter.js';
import { FilterRouter } from './routes/FilterRouter.js';
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();

app.set("trust proxy", 1);

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

// Mount routers
app.use('/auth', new AuthRouter().router);
app.use('/filters', new FilterRouter().router);

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔐 Auth: http://localhost:${PORT}/auth/github`);
  console.log(`🧪 Test: http://localhost:${PORT}/filters/test/pr`);
  console.log(`📊 Health: http://localhost:${PORT}/health`);
});