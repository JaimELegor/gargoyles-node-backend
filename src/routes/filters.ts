import type { Request, Response } from 'express';
import { Octokit } from '@octokit/core';
import { createPullRequest } from 'octokit-plugin-create-pull-request';
import type { FilterDef } from '../types/filter.types.ts';

const MyOctokit = Octokit.plugin(createPullRequest);

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

export async function submitFilter(
  req: Request<{}, {}, FilterDef>,
  res: Response
): Promise<void> {
  const submission = req.body;

  if (!req.user?.githubToken) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const octokit = new MyOctokit({
    auth: req.user.githubToken
  });

  try {
    const sanitizedName = submission.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const pr = await octokit.createPullRequest({
      owner: process.env.GITHUB_REPO_OWNER!,
      repo: process.env.GITHUB_REPO_NAME!,
      title: `[FILTER] ${submission.name} by @${req.user.username}`,
      body: generatePRBody(submission, req.user.username),
      head: `filter-${sanitizedName}-${Date.now()}`,
      base: 'main',
      changes: [
        {
          files: {
            [`filters/${sanitizedName}.json`]: JSON.stringify(
              {
                name: submission.name,
                author: req.user.username,
                version: submission.version || '1.0.0',
                description: submission.description,
                params: submission.params,
                processFunc: submission.processFunc,
                shader: submission.shader || '',
                createdAt: new Date().toISOString()
              },
              null,
              2
            )
          },
          commit: `Add ${submission.name} filter by @${req.user.username}`
        }
      ]
    });

    res.status(201).json({
      success: true,
      prUrl: pr?.data.html_url,
      prNumber: pr?.data.number,
      message: `Filter submitted successfully!`
    });

  } catch (error: any) {
    console.error('Filter submission error:', error);
    res.status(500).json({
      error: 'Failed to create pull request',
      details: error.message || error
    });
  }
}

function generatePRBody(metadata: FilterDef, username: string): string {
  return `
## Filter Submission

**Name:** ${metadata.name}
**Author:** @${username}

### Description
${metadata.description}

---
*Submitted via Gargoyles editor*
  `.trim();
}
