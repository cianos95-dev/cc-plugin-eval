# CI/CD

The project uses GitHub Actions for CI. Key workflows:

| Workflow                    | Purpose                                             |
| --------------------------- | --------------------------------------------------- |
| `ci.yml`                    | Build, lint, typecheck, test on PR and push         |
| `ci-failure-analysis.yml`   | AI analysis of CI failures                          |
| `claude-pr-review.yml`      | AI-powered code review on PRs                       |
| `claude-issue-analysis.yml` | AI-powered issue analysis                           |
| `claude.yml`                | Claude Code interactive workflow                    |
| `semantic-labeler.yml`      | Auto-label issues and PRs based on content          |
| `markdownlint.yml`          | Markdown linting                                    |
| `yaml-lint.yml`             | YAML linting                                        |
| `validate-workflows.yml`    | Validate GitHub Actions workflows with `actionlint` |
| `links.yml`                 | Check for broken links in documentation             |
| `sync-labels.yml`           | Sync repository labels from `labels.yml`            |
| `stale.yml`                 | Mark and close stale issues/PRs                     |
| `greet.yml`                 | Welcome new contributors                            |

CI runs tests in parallel with randomized order. Failed tests are retried twice before marking as failed.
