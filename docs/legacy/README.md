# Inactive upstream workflow references

These `.yml.txt` files preserve inherited automation for reference. GitHub Actions does not execute them from this directory.

- `bugfix-lab.yml.txt` contains concatenated, malformed Windows workflow fragments. Its reproduction scripts remain in `scripts/dev/bugfix-lab/`, but the workflow needs reconstruction and validation before reuse.
- `publik-patch-agent.yml.txt` has a placeholder toolchain setup and write permissions. Before reactivation, configure and test the toolchain, review dispatch inputs and credentials, restrict permissions, and enforce human review. Prompt instructions alone are not an authorization boundary.

Neither workflow is part of the active CI or a production-release acceptance promise. See [the security roadmap](../security-roadmap.md).
