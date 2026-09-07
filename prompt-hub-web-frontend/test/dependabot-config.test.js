const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const configPath = path.resolve(__dirname, "../../.github/dependabot.yml");

test("Dependabot keeps frontend dependency updates bounded and reviewable", () => {
  const source = fs.readFileSync(configPath, "utf8");
  const updateBlocks = source
    .split(/\n(?=[ ]{2}- package-ecosystem:)/)
    .slice(1);

  assert.equal(updateBlocks.length, 3);
  assert.match(
    updateBlocks[0],
    /package-ecosystem: "npm"[\s\S]*directory: "\/prompt-hub-web-frontend"/,
  );
  assert.match(
    updateBlocks[1],
    /package-ecosystem: "npm"[\s\S]*directory: "\/extension"/,
  );
  assert.match(
    updateBlocks[2],
    /package-ecosystem: "github-actions"[\s\S]*directory: "\/"/,
  );

  const expectedPolicies = [
    {
      block: updateBlocks[0],
      time: "09:00",
      limit: 3,
      prefix: "deps(web)",
      group: "web-minor-and-patch",
    },
    {
      block: updateBlocks[1],
      time: "09:15",
      limit: 3,
      prefix: "deps(extension)",
      group: "extension-minor-and-patch",
    },
    {
      block: updateBlocks[2],
      time: "09:30",
      limit: 2,
      prefix: "deps(actions)",
      group: "actions-minor-and-patch",
    },
  ];

  for (const { block, time, limit, prefix, group } of expectedPolicies) {
    assert.match(block, /target-branch: "develop-integrated"/);
    assert.match(block, /interval: "weekly"/);
    assert.match(block, /day: "monday"/);
    assert.match(block, new RegExp(`time: "${time}"`));
    assert.match(block, /timezone: "Asia\/Seoul"/);
    assert.match(block, new RegExp(`open-pull-requests-limit: ${limit}`));
    assert.match(
      block,
      new RegExp(`prefix: "${prefix.replace(/[()]/g, "\\$&")}"`),
    );
    assert.match(block, new RegExp(`${group}:`));
    assert.match(block, /applies-to: "version-updates"/);
    assert.match(block, /patterns:\s*\n\s*- "\*"/);
    assert.match(block, /update-types:[\s\S]*?- "minor"[\s\S]*?- "patch"/);
    assert.match(
      block,
      /dependency-name: "\*"[\s\S]*version-update:semver-major/,
    );
  }
});
