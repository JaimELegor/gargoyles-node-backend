import { execSync } from "child_process";
import fs from "fs";

const owner = process.env.GITHUB_REPO_OWNER || "JaimELegor";
const repo = process.env.GITHUB_REPO_NAME || "gargoyles-filters-test";
const branch = "main";

const RAW = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;

const files = execSync("git ls-files filters/**/*.json")
  .toString()
  .trim()
  .split("\n");

const filters = files.map((file) => {
  const data = JSON.parse(fs.readFileSync(file));

  const base = file.replace(".json", "");

  return {
    name: data.name,
    author: data.author,
    version: data.version,
    description: data.description,
    thumbnail: `${RAW}/${base}-thumbnail.webp`,
    json: `${RAW}/${file}`,
  };
});

fs.writeFileSync(
  "filters/index.json",
  JSON.stringify({ filters }, null, 2)
);

console.log(`Indexed ${filters.length} filters`);