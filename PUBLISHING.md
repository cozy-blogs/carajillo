# Publishing Guide

This document outlines the steps to publish the Carajillo package to npm.

## Prerequisites

1. **npm account**: Create an account at [npmjs.com](https://www.npmjs.com/)
2. **GitHub repository**: Push your code to GitHub
3. **Configure [trusted publishing](https://docs.npmjs.com/trusted-publishers)**: Once npm package is cerated

## Setup Steps

### 1. Update Repository URLs

Edit `package.json` and replace `YOUR_USERNAME` with your actual GitHub username:

```json
{
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR_USERNAME/carajillo.git"
  },
  "bugs": {
    "url": "https://github.com/YOUR_USERNAME/carajillo/issues"
  },
  "homepage": "https://github.com/YOUR_USERNAME/carajillo#readme"
}
```

Also update:
- `CHANGELOG.md`: Replace `YOUR_USERNAME` with your GitHub username
- `.github/dependabot.yml`: Update the reviewer if needed

### 2. Verify Package Configuration

```bash
# Check package.json is valid
npm pack --dry-run

# Verify what will be published
npm pack
```

### 3. Test Locally

```bash
# Test the prepublish script
npm run prepublishOnly
```

## Publishing Methods

### Method 1: Automatic (Recommended)

1. **Create a GitHub Release**:
   - Go to your repository on GitHub
   - Click **Releases** → **Create a new release**
   - Tag version: `v1.0.0` (must start with 'v')
   - Release title: `Release 1.0.0`
   - Description: Copy from `CHANGELOG.md`
   - Click **Publish release**

2. **GitHub Actions will automatically**:
   - Run tests
   - Build the package
   - Publish to npm

### Method 2: Manual via GitHub Actions

1. Go to **Actions** tab in your repository
2. Select **Publish to npm** workflow
3. Click **Run workflow**
4. Enter version number (e.g., `1.0.0`)
5. Click **Run workflow**

### Method 3: Manual via Command Line

```bash
# Login to npm (first time only)
npm login

# Update version
npm version patch  # or minor, major

# Publish
npm publish --access public
```

## Version Management

Follow [Semantic Versioning](https://semver.org/):
- **PATCH** (1.0.0 → 1.0.1): Bug fixes
- **MINOR** (1.0.0 → 1.1.0): New features (backward compatible)
- **MAJOR** (1.0.0 → 2.0.0): Breaking changes

## Post-Publishing Checklist

- [ ] Verify package appears on npm: https://www.npmjs.com/package/carajillo
- [ ] Update `CHANGELOG.md` with release date
- [ ] Create a GitHub release with release notes
- [ ] Announce the release (if applicable)

## Troubleshooting

### "Package name already exists"
- The package name `carajillo` might be taken
- Consider using a scoped package: `@your-username/carajillo`
- Update `package.json`: `"name": "@your-username/carajillo"`

### "Authentication failed"
- Verify `NPM_TOKEN` secret is set correctly in GitHub
- Ensure token has "Automation" type
- Check token hasn't expired

### "Build fails"
- Check GitHub Actions logs
- Ensure all tests pass locally
- Verify environment variables are set correctly

## Maintenance

- Keep dependencies updated (Dependabot will create PRs)
- Monitor security advisories
- Update `CHANGELOG.md` for each release
- Keep documentation up to date
