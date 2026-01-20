# CLI Reference

Complete reference for the `cc-plugin-eval` command-line interface.

## Quick Start

```bash
# Install
npm install -g cc-plugin-eval

# Basic usage - evaluate a plugin
cc-plugin-eval run -p ./my-plugin

# Preview without execution
cc-plugin-eval run -p ./my-plugin --dry-run

# Get help
cc-plugin-eval --help
cc-plugin-eval <command> --help
```

## Commands Overview

| Command   | Description                                           |
| --------- | ----------------------------------------------------- |
| `run`     | Run full evaluation pipeline (all 4 stages)           |
| `resume`  | Resume from saved state                               |
| `report`  | Generate report from existing results                 |
| `list`    | List previous runs                                    |
| `analyze` | Run Stage 1 only: Plugin Analysis                     |
| `generate`| Run Stages 1-2: Analysis and Scenario Generation      |
| `execute` | Run Stages 1-3: Analysis, Generation, and Execution   |

## Command Reference

### run

Run the full evaluation pipeline across all 4 stages.

```bash
cc-plugin-eval run [options]
```

**Input Options:**

| Option                  | Description                              |
| ----------------------- | ---------------------------------------- |
| `-p, --plugin <path>`   | Path to plugin directory                 |
| `-c, --config <path>`   | Path to config file (default: config.yaml) |
| `--marketplace <path>`  | Evaluate all plugins in marketplace      |

**Execution Mode:**

| Option                  | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `--dry-run, --dr`       | Generate scenarios without execution             |
| `--fast`                | Only run previously failed scenarios             |
| `--failed-run <id>`     | Run ID to get failed scenarios from              |
| `--no-batch`            | Force synchronous execution                      |
| `--rewind`              | Undo file changes after each scenario            |
| `--estimate, --est`     | Show cost estimate before execution              |

**Output Options:**

| Option                  | Description                              |
| ----------------------- | ---------------------------------------- |
| `-o, --output <format>` | Output format: json\|yaml\|junit-xml\|tap |
| `-v, --verbose`         | Detailed progress output                 |
| `--debug`               | Enable debug output                      |

**Testing Options:**

| Option                   | Description                                        |
| ------------------------ | -------------------------------------------------- |
| `--with-plugins <paths>` | Additional plugins for conflict testing (comma-separated) |
| `--semantic`             | Generate prompt variations to test robustness      |
| `--samples <n>`          | Multi-sample judgment count (improves confidence)  |
| `--reps <n>`             | Repeat each scenario N times (measures variance)   |

**Examples:**

```bash
# Full evaluation
cc-plugin-eval run -p ./my-plugin

# Dry run to preview scenarios
cc-plugin-eval run -p ./my-plugin --dry-run

# Cost estimation
cc-plugin-eval run -p ./my-plugin --estimate

# Re-run only failed scenarios
cc-plugin-eval run -p ./my-plugin --fast --failed-run abc123

# With semantic variations
cc-plugin-eval run -p ./my-plugin --semantic --reps 3

# Verbose with specific output format
cc-plugin-eval run -p ./my-plugin -v -o junit-xml
```

---

### resume

Resume a pipeline run from saved state.

```bash
cc-plugin-eval resume [options]
```

**Identification Options:**

| Option                     | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| `-r, --run-id <id>`        | Run ID to resume                                     |
| `-p, --plugin <name>`      | Plugin name (finds latest run)                       |
| `-s, --from-stage <stage>` | Stage to resume from: analysis\|generation\|execution\|evaluation |

**Examples:**

```bash
# Resume latest run for a plugin
cc-plugin-eval resume -p my-plugin

# Resume specific run
cc-plugin-eval resume -r abc123

# Resume from a specific stage
cc-plugin-eval resume -r abc123 -s execution
```

---

### report

Generate a report from existing evaluation results.

```bash
cc-plugin-eval report [options]
```

**Identification Options:**

| Option               | Description                |
| -------------------- | -------------------------- |
| `-r, --run-id <id>`  | Run ID to report on        |
| `-p, --plugin <name>`| Plugin name                |

**Output Options:**

| Option                  | Description                              |
| ----------------------- | ---------------------------------------- |
| `-o, --output <format>` | Output format: json\|yaml\|junit-xml\|tap |
| `--cli`                 | Output CLI summary                       |

**Examples:**

```bash
# JSON report (default)
cc-plugin-eval report -p my-plugin

# YAML format
cc-plugin-eval report -r abc123 -o yaml

# JUnit XML for CI integration
cc-plugin-eval report -r abc123 -o junit-xml > results.xml

# TAP format
cc-plugin-eval report -p my-plugin -o tap

# CLI summary
cc-plugin-eval report -r abc123 --cli
```

---

### list

List previous runs.

```bash
cc-plugin-eval list [options]
```

**Filter Options:**

| Option               | Description                              |
| -------------------- | ---------------------------------------- |
| `-p, --plugin <name>`| Filter by plugin name                    |

**Examples:**

```bash
# List all runs
cc-plugin-eval list

# List runs for specific plugin
cc-plugin-eval list -p my-plugin
```

---

### analyze

Run Stage 1 only: Plugin Analysis.

```bash
cc-plugin-eval analyze [options]
```

**Input Options:**

| Option               | Description                               |
| -------------------- | ----------------------------------------- |
| `-p, --plugin <path>`| Path to plugin directory                  |
| `-c, --config <path>`| Path to config file (default: config.yaml)|

**Examples:**

```bash
# Analyze a plugin
cc-plugin-eval analyze -p ./my-plugin

# With custom config
cc-plugin-eval analyze -p ./my-plugin -c custom-config.yaml
```

---

### generate

Run Stages 1-2: Analysis and Scenario Generation.

```bash
cc-plugin-eval generate [options]
```

**Input Options:**

| Option               | Description                               |
| -------------------- | ----------------------------------------- |
| `-p, --plugin <path>`| Path to plugin directory                  |
| `-c, --config <path>`| Path to config file (default: config.yaml)|

**Testing Options:**

| Option       | Description                                   |
| ------------ | --------------------------------------------- |
| `--verbose`  | Detailed progress output                      |
| `--semantic` | Generate prompt variations to test robustness |

**Examples:**

```bash
# Generate scenarios
cc-plugin-eval generate -p ./my-plugin

# With semantic variations
cc-plugin-eval generate -p ./my-plugin --semantic --verbose
```

---

### execute

Run Stages 1-3: Analysis, Generation, and Execution.

```bash
cc-plugin-eval execute [options]
```

**Input Options:**

| Option               | Description                               |
| -------------------- | ----------------------------------------- |
| `-p, --plugin <path>`| Path to plugin directory                  |
| `-c, --config <path>`| Path to config file (default: config.yaml)|

**Output Options:**

| Option      | Description              |
| ----------- | ------------------------ |
| `--verbose` | Detailed progress output |

**Examples:**

```bash
# Execute without evaluation
cc-plugin-eval execute -p ./my-plugin

# Verbose output
cc-plugin-eval execute -p ./my-plugin --verbose
```

---

## Output Formats

### JSON (default)

Standard JSON output with full evaluation data:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "plugin_name": "my-plugin",
  "metrics": {
    "total": 10,
    "passed": 8,
    "failed": 2
  },
  "results": [...]
}
```

### YAML

Human-readable YAML format:

```yaml
timestamp: "2024-01-15T10:30:00Z"
plugin_name: my-plugin
metrics:
  total: 10
  passed: 8
  failed: 2
results:
  - ...
```

### JUnit XML

Standard JUnit XML format for CI/CD integration:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="my-plugin" tests="10" failures="2">
  <testsuite name="my-plugin" tests="10" failures="2">
    <testcase name="skill-trigger-1" classname="skill">
      <failure message="Expected trigger not detected"/>
    </testcase>
  </testsuite>
</testsuites>
```

### TAP (Test Anything Protocol)

TAP format for test harness integration:

```tap
TAP version 13
1..10
ok 1 - skill-trigger-1
ok 2 - skill-trigger-2
not ok 3 - agent-trigger-1
  ---
  message: Expected trigger not detected
  ...
```

---

## Configuration

CLI options override values in `config.yaml`. Precedence (highest to lowest):

1. CLI flags
2. Environment variables
3. `config.yaml`
4. Built-in defaults

### Environment Variables

| Variable           | Description              |
| ------------------ | ------------------------ |
| `ANTHROPIC_API_KEY`| Anthropic API key        |

### Config File

Create `config.yaml` in your project root:

```yaml
plugin_path: ./plugins/my-plugin
verbose: true
dry_run: false
semantic:
  enabled: false
evaluation:
  samples: 1
  reps: 1
```

---

## Common Workflows

### Development Workflow

```bash
# 1. Analyze plugin structure
cc-plugin-eval analyze -p ./my-plugin

# 2. Generate and review scenarios
cc-plugin-eval generate -p ./my-plugin --verbose

# 3. Full evaluation
cc-plugin-eval run -p ./my-plugin
```

### CI/CD Workflow

```bash
# Run with JUnit output for CI
cc-plugin-eval run -p ./my-plugin -o junit-xml > results.xml

# Check exit code
if [ $? -ne 0 ]; then
  echo "Evaluation failed"
  exit 1
fi
```

### Iterative Testing

```bash
# First run
cc-plugin-eval run -p ./my-plugin

# Fix issues, then re-run only failed scenarios
cc-plugin-eval run -p ./my-plugin --fast --failed-run <previous-run-id>
```

### Cost Estimation

```bash
# Preview cost before running
cc-plugin-eval run -p ./my-plugin --estimate

# Dry run to see scenarios without cost
cc-plugin-eval run -p ./my-plugin --dry-run
```
