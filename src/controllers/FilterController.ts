import { Octokit } from '@octokit/core';
import { createPullRequest } from 'octokit-plugin-create-pull-request';
import type { Request, Response } from 'express';
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

export class FilterController {
  static validateSubmission(submission: FilterDef): string | null {
    if (
      !submission.name ||
      !/^[a-zA-Z/]{1,256}$/.test(submission.name.trim()) ||
      submission.name.includes('//')
    ) {
      return 'Invalid name: letters and "/" only, no double slashes, max 256 chars.';
    }

    if (!submission.params || typeof submission.params !== 'object') {
      return 'Params must be an object.';
    }

    for (const [paramName, config] of Object.entries(submission.params)) {
      if (!/^[a-z0-9]{1,16}$/.test(paramName)) {
        return `Invalid param name "${paramName}": lowercase letters/digits only, max 16 chars.`;
      }

      const { value, min, max, step } = config as {
        value: number; min: number; max: number; step: number;
      };

      if (typeof value !== 'number' || typeof min !== 'number' ||
          typeof max !== 'number' || typeof step !== 'number') {
        return `Param "${paramName}": value, min, max, and step must all be numbers.`;
      }

      if (max <= min) {
        return `Param "${paramName}": max must be greater than min.`;
      }

      if (value < min || value > max) {
        return `Param "${paramName}": value must be between ${min} and ${max}.`;
      }

      if (step <= 0 || step >= max) {
        return `Param "${paramName}": step must be > 0 and < max (${max}).`;
      }
    }

    return null;
  }

  static generateReadme(submission: FilterDef, username: string): string {
    const filterName = submission.name.split('/').at(-1) ?? submission.name;
    const category   = submission.name.includes('/')
      ? submission.name.slice(0, submission.name.lastIndexOf('/'))
      : null;

    // Params table — inferred from submission.params
    const paramRows = Object.entries(submission.params || {})
      .map(([name, cfg]) => {
        const { value, min, max, step } = cfg as {
          value: number; min: number; max: number; step: number;
        };
        return `| \`${name}\` | \`${value}\` | \`${min}\` | \`${max}\` | \`${step}\` |`;
      })
      .join('\n');

    const paramsTable = paramRows.length > 0
      ? `## Parameters\n\n| Name | Default | Min | Max | Step |\n|------|---------|-----|-----|------|\n${paramRows}`
      : `## Parameters\n\n_No parameters._`;

    // processFunc snippet — inferred from submission
    const paramNames = Object.keys(submission.params || {});
    const destructure = paramNames.length > 0
      ? `  const [${paramNames.join(', ')}] = params;\n  `
      : '  ';

    const processFuncSnippet = submission.processFunc
      ? `\`\`\`js\n${submission.processFunc}\n\`\`\``
      : `\`\`\`js\n(img, r, g, b, a, x, y, ...params) => {\n${destructure}// your logic here\n}\n\`\`\``;

    // Shader section — only included if a shader is provided
    const shaderSection = submission.shader
      ? `## Shader (GLSL)\n\n\`\`\`glsl\n${submission.shader}\n\`\`\``
      : '';

    const categorySection = category
      ? `**Category:** \`${category}\``
      : '';

    return [
      `# ${filterName}`,
      '',
      submission.description?.trim() || '_No description provided._',
      '',
      '## Info',
      '',
      `**Author:** @${username}`,
      `**Version:** ${submission.version || '1.0.0'}`,
      categorySection,
      '',
      paramsTable,
      '',
      '## Process Function',
      '',
      processFuncSnippet,
      '',
      shaderSection,
      shaderSection ? '' : null,
      '---',
      '*Submitted via Gargoyles editor*',
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  static async submitFilter(req: Request<{}, {}, FilterDef>, res: Response): Promise<void> {
    const submission = req.body;

    if (!req.user?.githubToken) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const validationError = FilterController.validateSubmission(submission);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const octokit = new MyOctokit({ auth: req.user.githubToken });

    try {
      var sanitizedName = submission.name
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-/]/g, '')  // preserve "/" for nested paths
        .replace(/\/+/g, '/');         // collapse double slashes

      sanitizedName += "/" + sanitizedName.split("/").at(-1);

      const pr = await octokit.createPullRequest({
        owner: process.env.GITHUB_REPO_OWNER!,
        repo: process.env.GITHUB_REPO_NAME!,
        title: `[FILTER] ${submission.name} by @${req.user.username}`,
        body: FilterController.generatePRBody(submission, req.user.username),
        head: `filter-${sanitizedName.replace(/\//g, '-')}-${Date.now()}`,
        base: 'main',
        changes: [
          {
            files: {
              // JSON definition
              [`filters/${sanitizedName}.json`]: JSON.stringify(
                {
                  name: submission.name,
                  author: req.user.username,
                  version: submission.version || '1.0.0',
                  description: submission.description,
                  params: submission.params,
                  processFunc: submission.processFunc,
                  shader: submission.shader || '',
                  createdAt: new Date().toISOString(),
                },
                null,
                2
              ),
              // Auto-generated README alongside the JSON
              [`filters/${sanitizedName}.md`]: FilterController.generateReadme(
                submission,
                req.user.username
              ),
                [`filters/${sanitizedName}-thumbnail.webp`]: {
                  content: submission.thumbnail, // already base64
                  encoding: "base64",
                },
            },
            commit: `Add ${submission.name} filter by @${req.user.username}`,
          },
        ],
      });

      res.status(201).json({
        success: true,
        prUrl: pr?.data.html_url,
        prNumber: pr?.data.number,
        message: `Filter submitted successfully!`,
      });

    } catch (error: any) {
      console.error('Filter submission error:', error);
      res.status(500).json({
        error: 'Failed to create pull request',
        details: error.message,
      });
    }
  }

  static generatePRBody(metadata: FilterDef, username: string): string {
    return `
## Filter Submission

**Name:** ${metadata.name}
**Author:** @${username}

### Description
${metadata.description || '_No description provided._'}

---
*Submitted via Gargoyles editor*
    `.trim();
  }
}