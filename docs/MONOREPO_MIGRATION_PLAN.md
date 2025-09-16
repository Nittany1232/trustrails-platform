# TrustRails Monorepo Migration Plan - Zero Downtime Strategy

## Executive Summary
This document outlines a safe, phased migration from the current TrustRails structure to a monorepo architecture without breaking production services.

## Current State Analysis

### Critical Dependencies Identified
1. **Path Aliases**: 1000+ files using `@/` imports
2. **Firebase Functions**: Multiple codebases with cross-dependencies
3. **Environment Variables**: Multiple .env files across modules
4. **Hardcoded Paths**: Service account files, credentials
5. **eth-sdk Module**: Standalone Hardhat project with contract compilation

### Risk Assessment
- **CRITICAL**: Firebase deployment configuration
- **HIGH**: TypeScript path mappings, environment variables
- **MEDIUM**: Build scripts, test configurations
- **LOW**: Documentation, development scripts

## Migration Strategy: Parallel Development Approach

### Phase 1: Parallel Monorepo Creation (Week 1)
**Zero Risk - No changes to production**

```bash
/home/stock1232/projects/
├── trustrails/              # KEEP RUNNING (unchanged)
└── trustrails-platform/     # NEW monorepo
    ├── apps/
    │   └── widget-demo/     # New widget testing
    ├── packages/
    │   ├── rollover-widget/ # Embeddable widget
    │   ├── shared-types/    # Extracted types
    │   └── dol-processor/   # DOL data service
    └── turbo.json
```

**Actions:**
1. Create new monorepo structure
2. Initialize Turborepo
3. Set up initial packages
4. No changes to existing TrustRails

### Phase 2: Shared Package Development (Week 2-3)
**Low Risk - Addition only, no modifications**

**Create shared packages:**
```typescript
// packages/shared-types/package.json
{
  "name": "@trustrails/shared-types",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts"
}
```

**Link to existing project:**
```json
// trustrails/package.json
{
  "dependencies": {
    "@trustrails/shared-types": "file:../trustrails-platform/packages/shared-types"
  }
}
```

### Phase 3: Widget Development (Week 3-4)
**Zero Risk - Independent development**

1. Build embeddable widget in isolation
2. Create partner dashboard
3. Set up DOL data pipeline
4. Test with demo app

### Phase 4: TrustRails Integration Preparation (Week 5)
**Medium Risk - Careful testing required**

#### 4.1 Update Path Mappings
```javascript
// migration-scripts/update-imports.js
const glob = require('glob');
const fs = require('fs');

// Update all @/ imports to be workspace-aware
const files = glob.sync('apps/trustrails/**/*.{ts,tsx,js,jsx}');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  // Keep @/ working but prepare for transition
  content = content.replace(
    /from ['"]@\//g,
    "from '@trustrails/"
  );
  fs.writeFileSync(file, content);
});
```

#### 4.2 Consolidate Environment Variables
```bash
# Create workspace .env structure
trustrails-platform/
├── .env                    # Shared variables
├── apps/
│   └── trustrails/
│       └── .env.local     # App-specific
└── packages/
    └── eth-sdk/
        └── .env           # Package-specific
```

#### 4.3 Update Firebase Configuration
```json
// New firebase.json
{
  "functions": [
    {
      "source": "apps/trustrails/functions",
      "codebase": "app-functions",
      "ignore": ["node_modules", ".git"]
    },
    {
      "source": "packages/etl-functions",
      "codebase": "etl-functions",
      "ignore": ["node_modules", ".git"]
    }
  ]
}
```

### Phase 5: Migration Execution (Week 6)
**High Risk - Requires maintenance window**

#### Pre-Migration Checklist
- [ ] Full backup created
- [ ] All tests passing
- [ ] Firebase functions tested locally
- [ ] Environment variables documented
- [ ] Rollback plan ready

#### Migration Script
```bash
#!/bin/bash
# safe-trustrails-migration.sh

set -e  # Exit on error

echo "Starting TrustRails monorepo migration..."

# 1. Backup
echo "Creating backup..."
cp -r trustrails trustrails-backup-$(date +%Y%m%d-%H%M%S)

# 2. Create git worktree for testing
echo "Creating test worktree..."
cd trustrails
git worktree add ../trustrails-platform-test main

# 3. Move to monorepo structure
echo "Restructuring to monorepo..."
cd ../trustrails-platform-test
mkdir -p apps
mv * apps/trustrails/ 2>/dev/null || true
mv .* apps/trustrails/ 2>/dev/null || true

# 4. Add monorepo configuration
echo "Adding Turborepo configuration..."
cat > package.json << 'EOF'
{
  "name": "trustrails-platform",
  "private": true,
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "latest"
  }
}
EOF

cat > turbo.json << 'EOF'
{
  "$schema": "https://turbo.build/schema.json",
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false
    },
    "test": {}
  }
}
EOF

# 5. Update paths in trustrails app
echo "Updating import paths..."
cd apps/trustrails

# Update tsconfig.json
sed -i.bak 's|"@/\*": \["\./\*"\]|"@/*": ["./\*"]|g' tsconfig.json

# Update package.json name
sed -i.bak 's|"name": "trustrails"|"name": "@trustrails/web"|g' package.json

# 6. Install dependencies
echo "Installing dependencies..."
cd ../..
npm install

# 7. Test build
echo "Testing build..."
npm run build

echo "Migration complete! Test the application before deploying."
```

### Phase 6: Gradual Service Migration (Week 7-8)
**Low Risk - Service by service**

1. **Firebase Functions**: Migrate one codebase at a time
2. **eth-sdk Module**: Convert to workspace package
3. **Scripts**: Update paths incrementally
4. **CI/CD**: Update deployment pipelines

## Rollback Plan

### Immediate Rollback (< 5 minutes)
```bash
#!/bin/bash
# rollback.sh

# 1. Stop new deployment
pm2 stop trustrails-platform

# 2. Restore original
cd /home/stock1232/projects
rm -rf trustrails
mv trustrails-backup-[date] trustrails

# 3. Restart services
cd trustrails
npm run dev
```

### Partial Rollback Strategy
- Keep monorepo for new features
- Maintain original for production
- Gradually migrate services
- Use feature flags for switching

## File-by-File Update Guide

### Critical Files Requiring Updates

#### 1. TypeScript Configuration
```json
// apps/trustrails/tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@trustrails/shared": ["../../packages/shared/src"],
      "@trustrails/types": ["../../packages/types/src"]
    }
  }
}
```

#### 2. Jest Configuration
```javascript
// apps/trustrails/jest.config.js
module.exports = {
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@trustrails/(.*)$': '<rootDir>/../../packages/$1/src'
  }
};
```

#### 3. Next.js Configuration
```javascript
// apps/trustrails/next.config.js
const path = require('path');

module.exports = {
  transpilePackages: ['@trustrails/shared', '@trustrails/types'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, './src')
    };
    return config;
  }
};
```

#### 4. Environment Variable Loading
```javascript
// apps/trustrails/lib/env.js
import { config } from 'dotenv';
import path from 'path';

// Load workspace root env
config({ path: path.resolve(__dirname, '../../../.env') });
// Load app-specific env
config({ path: path.resolve(__dirname, '../.env.local') });
```

## Testing Strategy

### Pre-Migration Testing
1. Run full test suite in current structure
2. Document all passing tests
3. Create integration test baseline

### Post-Migration Testing
1. Unit tests per package
2. Integration tests across packages
3. E2E tests for critical flows
4. Firebase function testing
5. Deployment testing in staging

### Validation Checklist
- [ ] All imports resolve correctly
- [ ] Environment variables load
- [ ] Firebase functions deploy
- [ ] eth-sdk contracts compile
- [ ] Tests pass (unit, integration, e2e)
- [ ] Build succeeds
- [ ] Development server runs
- [ ] Production build deploys

## Benefits After Migration

1. **Code Sharing**: Share types, utilities, and components
2. **Independent Deployment**: Deploy widget without touching TrustRails
3. **Better Testing**: Isolated package testing
4. **Faster Development**: Parallel development on different packages
5. **Type Safety**: Shared types across all packages
6. **Dependency Management**: Single node_modules installation

## Timeline

- **Week 1**: Set up parallel monorepo, create widget package
- **Week 2-3**: Develop shared packages and widget
- **Week 4**: Widget testing and partner dashboard
- **Week 5**: Prepare TrustRails for migration
- **Week 6**: Execute migration (maintenance window)
- **Week 7-8**: Gradual service migration
- **Week 9-10**: Optimization and cleanup

## Support and Monitoring

### During Migration
- Monitor error logs
- Check Firebase function execution
- Verify blockchain transactions
- Track API response times

### Post-Migration
- Set up monorepo-specific monitoring
- Configure alerts for build failures
- Track deployment success rates
- Monitor package interdependencies

## Conclusion

This phased approach minimizes risk by:
1. Building new features in parallel without touching production
2. Testing extensively before migration
3. Providing clear rollback procedures
4. Migrating incrementally rather than all at once

The key is to maintain the existing TrustRails application running while building the new monorepo structure alongside it, only migrating when fully tested and ready.