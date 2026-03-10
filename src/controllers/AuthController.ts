import { Octokit } from '@octokit/rest';
import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';
import crypto from "crypto";
import { createHash } from 'crypto';

export const exchangeStore = new Map<
  string,
  { jwtToken: string; user: { username: string; avatar: string }; expiresAt: number }
>();

export function sha256base64url(input: string) {
  return createHash("sha256").update(input).digest("base64url");
}

export class AuthController {
  static async exchange(req: Request, res: Response): Promise<void> {
    const exchange = req.query.exchange as string | undefined;
    if (!exchange) return void res.status(400).json({ error: "Missing exchange code" });

    const entry = exchangeStore.get(exchange);
    if (!entry) return void res.status(400).json({ error: "Invalid/used exchange code" });

    if (Date.now() > entry.expiresAt) {
      exchangeStore.delete(exchange);
      return void res.status(400).json({ error: "Exchange expired" });
    }

    exchangeStore.delete(exchange); // one-time use
    res.json({ token: entry.jwtToken, user: entry.user });
  }
  static async githubAuthRedirect(req: Request, res: Response): Promise<void> {
    const clientId = process.env.GITHUB_CLIENT_ID!;
    const redirectUri = `${process.env.BACKEND_URL}/auth/github/callback`;

    const state = crypto.randomBytes(16).toString("hex");
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = sha256base64url(codeVerifier); 

    // Store state in an httpOnly cookie for later validation
    res.cookie("oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 10 * 60 * 1000 // 10 min
    });

    res.cookie('pkce_verifier', codeVerifier, {
       httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === "production",
        maxAge: 10 * 60 * 1000,
      });

    const authUrl =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent("public_repo")}` +
      `&state=${encodeURIComponent(state)}` +
      `&code_challenge=${codeChallenge}&code_challenge_method=S256`;

    res.redirect(authUrl);
  }

  static async githubCallback(req: Request, res: Response): Promise<void> {
    const code = req.query.code as string;
    const state = req.query.state as string | undefined;
    const cookieState = req.cookies?.oauth_state;
    const codeVerifier = req.cookies?.pkce_verifier as string | undefined;

    if (!state || !cookieState || state !== cookieState) {
      res.status(400).send("Invalid state");
      return;
    }
    if (!code) {
      res.status(400).send('No authorization code');
      return;
    }
    if (!codeVerifier) return void res.status(400).send("Missing PKCE verifier");

    try {
      // Exchange code for token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID!,
          client_secret: process.env.GITHUB_CLIENT_SECRET!,
          code,
          redirect_uri: `${process.env.BACKEND_URL}/auth/github/callback`,
          code_verifier: codeVerifier,
        })
      });

      const tokenData = await tokenResponse.json();
      
      if (!tokenData.access_token) {
        res.status(400).send('Failed to get access token');
        return;
      }

      // Get user info
      const octokit = new Octokit({ auth: tokenData.access_token });
      const { data: user } = await octokit.users.getAuthenticated();

      // Create JWT
      const jwtToken = jwt.sign(
        {
          githubId: user.id,
          username: user.login,
          githubToken: tokenData.access_token
        },
        process.env.JWT_SECRET!,
        { expiresIn: '5m' }
      );

      const exchangeCode = crypto.randomBytes(32).toString("hex");

      exchangeStore.set(exchangeCode, {
        jwtToken,
        user: { username: user.login, avatar: user.avatar_url },
        expiresAt: Date.now() + 2 * 60 * 1000,
      });

      res.clearCookie("oauth_state", { path: "/" });
      res.clearCookie("pkce_verifier", { path: "/" });

      // Redirect to frontend
      res.redirect(`${process.env.FRONTEND_URL}?exchange=${exchangeCode}`);
    } catch (error) {
      console.error('OAuth error:', error);
      res.status(500).send('OAuth failed');
    }
  }
}
