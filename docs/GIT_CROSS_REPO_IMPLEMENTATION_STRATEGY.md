# Git Cross-Repository Implementation Strategy

## Current Situation

We have two separate Git repositories:
1. **`trustrails`** - The existing main application (where implementation happens)
2. **`trustrails-platform`** - The new monorepo (where planning/documentation lives, widget code)

## The Challenge

- Planning and architecture docs are in `trustrails-platform`
- Actual implementation needs to happen in `trustrails`
- Eventually, `trustrails` will be migrated into `trustrails-platform` as `/apps/trustrails`

## Implementation Strategy

### Option 1: Build in TrustRails, Document in Platform (RECOMMENDED)

This is the most practical approach given the current state.

```
trustrails/                          trustrails-platform/
├── app/                             ├── docs/
│   ├── custodians/                  │   ├── CUSTODIAN_INTEGRATION_ARCHITECTURE_V2.md
│   │   └── dashboard/               │   └── implementation-notes.md
│   │       └── [custodianId]/       ├── packages/
│   │           └── integrations/    │   └── rollover-widget/
│   │               ├── page.tsx     │       └── (widget implementation)
│   │               ├── widget/      └── future/
│   │               └── api/                 └── (placeholder for migration)
│   └── api/
│       └── custodian/
│           └── integration/
```

**Workflow:**
1. Keep all documentation in `trustrails-platform/docs/`
2. Implement features in `trustrails` repository
3. Widget package stays in `trustrails-platform/packages/rollover-widget/`
4. Use git commits to reference docs: `"Implements design from trustrails-platform/docs/..."`

**Git Commands:**
```bash
# In trustrails repo
git checkout -b feature/custodian-integrations
# Make implementation changes
git commit -m "feat: Add custodian integration portal

Implements architecture from trustrails-platform/docs/CUSTODIAN_INTEGRATION_ARCHITECTURE_V2.md
- Add integration dashboard at /custodians/dashboard/[id]/integrations
- Integrate with existing audit system
- Add API key management"

# In trustrails-platform repo
git checkout -b docs/custodian-integrations
# Update documentation as implementation progresses
git commit -m "docs: Update integration architecture based on implementation feedback"
```

### Option 2: Git Submodules (NOT RECOMMENDED)

Add trustrails as a submodule in the platform repo:

```bash
cd trustrails-platform
git submodule add ../trustrails apps/trustrails
```

**Problems:**
- Submodules are complex and error-prone
- Team members need to understand submodule workflows
- CI/CD becomes more complicated
- Not worth it for temporary situation

### Option 3: Shared Branch Names (For Coordination)

Use matching branch names across repos for related work:

```bash
# Both repos use same branch name
trustrails: feature/custodian-integrations-impl
trustrails-platform: feature/custodian-integrations-docs
```

This makes it easy to track related work across repos.

## Recommended Approach: Phased Implementation

### Phase 1: Current Development (Now - 2 months)

**In `trustrails` repo:**
```typescript
// app/custodians/dashboard/[custodianId]/integrations/page.tsx
// Implementation based on trustrails-platform docs

import { UnifiedAuditLogger } from '@/lib/audit/unified-audit-logger';

export default function IntegrationsPage() {
  // Implementation here
}
```

**In `trustrails-platform` repo:**
```markdown
// docs/implementation-status.md
## Implementation Status

- [x] Architecture documented
- [ ] Integration dashboard - IN PROGRESS (trustrails#feature/custodian-integrations)
- [ ] API key management
- [ ] Widget configuration
```

### Phase 2: Widget Development (Parallel)

The widget is already in the right place:

```typescript
// trustrails-platform/packages/rollover-widget/src/trustrails-widget.ts
// This stays here and develops independently

export class TrustRailsWidget extends LitElement {
  // Widget can be developed and tested independently
  // Published to npm from this repo
}
```

**Integration in trustrails:**
```typescript
// trustrails/app/custodians/dashboard/[custodianId]/integrations/widget/page.tsx
import { WIDGET_EMBED_CODE } from '@/lib/constants/widget-config';

// Reference the npm package that will be published from trustrails-platform
const embedCode = `
<script src="https://unpkg.com/@trustrails/widget@latest"></script>
<trustrails-widget ...></trustrails-widget>
`;
```

### Phase 3: Future Migration (3-6 months)

When ready to migrate trustrails into the monorepo:

```bash
# 1. Create migration branch in trustrails-platform
cd trustrails-platform
git checkout -b feature/migrate-main-app

# 2. Copy trustrails code into monorepo
cp -r ../trustrails apps/trustrails

# 3. Update imports and configurations
# - Update package.json
# - Fix import paths
# - Update build scripts

# 4. Preserve git history (optional but recommended)
cd apps/trustrails
git init
git remote add old-origin ../../trustrails/.git
git fetch old-origin
git merge old-origin/main --allow-unrelated-histories
```

## Development Workflow

### Daily Development Process

1. **Morning Sync:**
   - Check `trustrails-platform/docs/` for latest architecture updates
   - Review implementation tasks

2. **Implementation:**
   - Work in `trustrails` repo
   - Reference docs in commit messages
   - Create PRs in trustrails repo

3. **Documentation Updates:**
   - Update `trustrails-platform/docs/implementation-status.md`
   - Document any architecture changes discovered during implementation
   - Keep API contracts in sync

### Code Review Process

For changes spanning both repos:

1. **Create linked PRs:**
   ```
   trustrails PR #123: "Implement custodian integrations"
   Description: "Implements design from trustrails-platform PR #456"

   trustrails-platform PR #456: "Document custodian integrations"
   Description: "Architecture for trustrails PR #123"
   ```

2. **Review both PRs together**
3. **Merge documentation first, then implementation**

## Practical Example: Adding API Key Management

### Step 1: Document in trustrails-platform
```markdown
# trustrails-platform/docs/features/api-key-management.md
## API Key Management Specification
- Generate/revoke keys
- Scoping and permissions
- Audit logging integration
```

### Step 2: Implement in trustrails
```typescript
// trustrails/app/api/custodian/integration/api-keys/route.ts
import { UnifiedAuditLogger } from '@/lib/audit/unified-audit-logger';

export async function POST(req: Request) {
  // Implementation based on spec in trustrails-platform/docs/features/api-key-management.md
  const auditLogger = new UnifiedAuditLogger();

  // ... implementation ...

  await auditLogger.logEvent({
    eventType: 'INTEGRATION_API_KEY_CREATED',
    // ... as specified in docs
  });
}
```

### Step 3: Update package.json scripts
```json
// trustrails/package.json
{
  "scripts": {
    "dev": "next dev",
    "dev:with-widget": "echo 'Widget at http://localhost:5173' && next dev",
    "docs": "echo 'Documentation at ../trustrails-platform/docs'"
  }
}
```

## Managing Dependencies

### Shared Types (Temporary Solution)

Until migration, duplicate critical types:

```typescript
// trustrails/lib/types/integration.types.ts
// Keep in sync with trustrails-platform/packages/shared-types/src/integration.types.ts

export interface IntegrationConfig {
  // ... same in both repos
}
```

Add a sync check script:
```bash
#!/bin/bash
# scripts/check-type-sync.sh
diff trustrails/lib/types/integration.types.ts \
     trustrails-platform/packages/shared-types/src/integration.types.ts

if [ $? -ne 0 ]; then
  echo "Warning: Type definitions out of sync!"
fi
```

## CI/CD Considerations

### GitHub Actions Workflow

```yaml
# trustrails/.github/workflows/integration-tests.yml
name: Integration Tests

on:
  pull_request:
    paths:
      - 'app/custodians/dashboard/**/integrations/**'
      - 'app/api/custodian/integration/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Note documentation repo
        run: echo "Implements design from trustrails-platform repo"

      - name: Run integration tests
        run: npm test -- --testPathPattern=integration
```

## Benefits of This Approach

1. **Clear Separation**: Documentation and planning separate from implementation
2. **No Git Complexity**: Each repo maintains simple git history
3. **Parallel Development**: Widget team can work independently
4. **Easy Migration Path**: When ready, move trustrails into monorepo
5. **Preserve History**: Can maintain git history during migration

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Documentation drift | Weekly sync meetings, linked PRs |
| Type definition mismatch | Sync check scripts, eventual shared package |
| Lost context between repos | Clear commit messages with cross-references |
| Deployment complexity | Widget deployed separately via npm |

## Summary

**For now:**
- Keep documentation in `trustrails-platform/docs/`
- Implement in `trustrails` repository
- Reference docs in commits and PRs
- Widget stays in `trustrails-platform/packages/rollover-widget/`

**Future:**
- Migrate `trustrails` → `trustrails-platform/apps/trustrails/`
- Unify everything in the monorepo
- Share packages properly

This approach minimizes complexity while maintaining clear organization and a path to future consolidation.