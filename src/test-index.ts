import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Octokit } from '@octokit/core';
import { createPullRequest } from 'octokit-plugin-create-pull-request';



dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Validate filter
app.post('/api/filters/validate', (req, res) => {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ valid: false, errors: ['No code provided'] });
  }

  const dangerous = [/eval\(/gi, /Function\(/gi, /require\(/gi];
  const errors = dangerous
    .map((p, i) => p.test(code) ? ['eval() blocked', 'Function() blocked', 'require() blocked'][i] : null)
    .filter(Boolean);

  res.json({ valid: errors.length === 0, errors });
});

// Submit filter
app.post('/api/filters/submit', (req, res) => {
  const { filterScript, filterName, author, authorGitHub } = req.body;

  if (!filterScript || !filterName || !author || !authorGitHub) {
    return res.status(400).json({ success: false, message: 'Missing fields' });
  }

  res.status(201).json({
    success: true,
    message: 'Filter received',
    prNumber: 0,
  });
});

app.post('/test/pr', async (req, res) => {
  const submission = req.body;

  // Validate basic structure
  if (!submission.name || !submission.description) {
    return res.status(400).json({ 
      error: 'Missing name or description',
      body: req.body 
    });
  }

  console.log('[INFO] Test PR requested:');
  console.log('[INFO] - Name:', submission.name);
  console.log('[INFO] - Repo:', `${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`);

  try {
    // Use your personal token for testing (set GITHUB_TOKEN_TEST in .env)
    const MyOctokit = Octokit.plugin(createPullRequest);
    const octokit = new MyOctokit({
      auth: process.env.GITHUB_TOKEN_TEST
    });

    

    const sanitizedName = submission.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    console.log('[INFO] Creating PR with files:');
    console.log(`[INFO]  filters/${sanitizedName}.json`);

    const pr = await octokit.createPullRequest({
      owner: process.env.GITHUB_REPO_OWNER!,
      repo: process.env.GITHUB_REPO_NAME!,
      title: `[TEST] ${submission.name}`,
      body: `
## Test Filter Submission

**Name:** ${submission.name}

### Description
${submission.description}

**Params:** ${JSON.stringify(submission.params || {}, null, 2)}

---
*Test submission via Gargoyles backend*
      `,
      head: `test-${sanitizedName}-${Date.now()}`,
      base: 'main',
      changes: [
        {
          files: {
            [`filters/${sanitizedName}.json`]: JSON.stringify(
              {
                name: submission.name,
                description: submission.description,
                icon: submission.icon || '🔧',
                version: submission.version || '1.0.0',
                params: submission.params || {},
                processFunc: submission.processFunc || '// No process function',
                shader: submission.shader || '// No shader',
                createdAt: new Date().toISOString(),
                test: true
              },
              null,
              2
            )
          },
          commit: `Test: Add ${submission.name}`
        }
      ]
    });

    console.log('[INFO] PR created successfully!');
    console.log(`[INFO] - PR URL: ${pr?.data.html_url}`);
    console.log(`[INFO] - PR Number: ${pr?.data.number}`);

    res.status(201).json({
      success: true,
      prUrl: pr?.data.html_url,
      prNumber: pr?.data.number,
      message: 'Test PR created successfully!',
      debug: {
        sanitizedName,
        repo: `${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`
      }
    });

  } catch (error: any) {
    console.error('[ERROR] PR creation failed:');
    console.error('[ERROR] - Status:', error.status);
    console.error('[ERROR] - Message:', error.message);
    console.error('[ERROR] - Full error:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      status: error.status,
      debug: {
        envRepo: process.env.GITHUB_REPO_NAME,
        body: req.body
      }
    });
  }
});

app.listen(PORT, () => {
  console.log(`[INFO] Server on http://localhost:${PORT}`);
});
