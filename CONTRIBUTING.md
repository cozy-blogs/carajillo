# Contributing to Carajillo

Thank you for your interest in contributing to Carajillo! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for all contributors.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/YOUR_USERNAME/carajillo/issues)
2. If not, create a new issue using the [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.md)
3. Provide as much detail as possible:
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node.js version, etc.)
   - Error messages or logs

### Suggesting Features

1. Check if the feature has already been suggested
2. Create a new issue using the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.md)
3. Describe the use case and potential implementation

### Submitting Pull Requests

1. **Fork the repository** and create a branch from `main` or `master`
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Follow the existing code style
   - Write or update tests for new functionality
   - Update documentation as needed

3. **Run tests and checks**
   ```bash
   npm test         # Run tests
   npm run build    # Ensure build works
   ```

4. **Commit your changes**
   - Use clear, descriptive commit messages
   - Follow [Conventional Commits](https://www.conventionalcommits.org/) format when possible

5. **Push and create a Pull Request**
   - Fill out the PR template
   - Link to any related issues
   - Request review from maintainers

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/carajillo.git
   cd carajillo
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   ./scripts/generate-env.bash > .env.development.local
   # Edit .env.development.local with your configuration
   ln -s .env.development.local .env
   ```

4. **Run development server**
   ```bash
   npm run dev
   ```

## Code Style

- Use TypeScript for all new code
- Follow existing code formatting
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions focused and small

## Testing

- Write tests for all new features
- Ensure all tests pass: `npm test`
- Aim for good test coverage
- Test edge cases and error conditions

## Documentation

- Update README.md for user-facing changes
- Update CHANGELOG.md for significant changes
- Add JSDoc comments for new functions/classes
- Keep inline comments clear and concise

## Release Process

Releases are managed by maintainers. When ready:

1. Update version in `package.json`
2. Update `CHANGELOG.md` with release notes
3. Create a git tag: `git tag v1.0.0`
4. Push tag: `git push origin v1.0.0`
5. GitHub Actions will handle publishing to npm

## Questions?

Feel free to open an issue for questions or reach out to the maintainers.

Thank you for contributing! 🎉

