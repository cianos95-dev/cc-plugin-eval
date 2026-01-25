# GitHub Issue Management

## Issue Blocking Relationships

Use GraphQL mutations to set up issue dependencies (blocked by / blocks relationships).

### Get Issue Node IDs

```bash
gh issue list --state open --json number,id | jq -r '.[] | "\(.number)\t\(.id)"'
```

### Add a Blocking Relationship

`issueId` is blocked by `blockingIssueId`:

```bash
gh api graphql -f query='
mutation {
  addBlockedBy(input: {
    issueId: "I_kwDO...",
    blockingIssueId: "I_kwDO..."
  }) {
    issue { number title }
    blockingIssue { number title }
  }
}'
```

### Remove a Blocking Relationship

```bash
gh api graphql -f query='
mutation {
  removeBlockedBy(input: {
    issueId: "I_kwDO...",
    blockingIssueId: "I_kwDO..."
  }) {
    issue { number title }
    blockingIssue { number title }
  }
}'
```

### Example

To make #205 block #207 (meaning #207 is blocked by #205):

- `issueId` = #207's node ID (the blocked issue)
- `blockingIssueId` = #205's node ID (the blocking issue)
