# Contributing to Onscreenly

Thanks for helping. Small, focused pull requests get reviewed fastest.

## Before you start

- **Bugs:** open an issue with the bug template first, unless the fix is obvious and small.
- **Features:** open a feature request so we can agree on the approach before you build it.
- **Security issues:** never in a public issue. See [SECURITY.md](SECURITY.md).

## Set up

Node.js 22.13 or later:

```sh
git clone https://github.com/paypilotlabs/onscreenly.git
cd onscreenly
npm ci
npm start
```

Local Whisper, packaging and the project layout are in [docs/development.md](docs/development.md).

## Making a change

1. Branch from `main`.
2. Keep the change to one concern. Separate refactors from behavior changes.
3. Add or update tests in `test/` (unit) or `e2e/` (app tests) for what you changed.
4. Run the checks:

   ```sh
   npm run check        # lint, format check, type check, unit tests
   npm run test:e2e     # app tests (on Linux: xvfb-run -a npm run test:e2e)
   ```

5. Update the docs if behavior changes, and add a line under an "Unreleased" heading in [CHANGELOG.md](CHANGELOG.md).
6. Open a pull request and fill in the template.

## Ground rules

- No API keys, real transcripts, private meeting screenshots or personal documents in code, tests, issues or screenshots. Tests use synthetic data.
- Don't weaken the IPC checks, sandboxing or consent prompts to make something work. Ask in the issue instead.
- Commit messages say what changed in plain words ("Keep a question sent while an answer is on its way").

## License

Onscreenly is GPL-3.0-or-later. By contributing, you agree your contribution is licensed under the same terms.

## Conduct

Be respectful. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
