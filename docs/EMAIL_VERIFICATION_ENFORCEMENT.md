# Email Verification Enforcement Guide

## Why Route-Level Enforcement?

The Edge Runtime used by Next.js middleware doesn't support Node.js APIs like Firebase Admin SDK. Therefore, email verification must be enforced at the API route level instead of in middleware.

## Implementation Pattern

### For ALL Protected API Routes

Replace this:
```typescript
const user = await getServerToken(req);
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

With this:
```typescript
import { requireVerifiedUser } from '@/lib/auth/email-verification';

const { user, error } = await requireVerifiedUser(req, getServerToken);
if (error) return error;

// User is now authenticated AND email verified
```

### Manual Check Pattern

If you need more control:
```typescript
import { enforceEmailVerification } from '@/lib/auth/email-verification';

const user = await getServerToken(req);
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

const verificationError = await enforceEmailVerification(user.uid, req);
if (verificationError) {
  return verificationError; // Returns 403 with verification message
}

// Continue with verified user
```

## Bypass List (Exceptions)

These endpoints should NOT check email verification:

1. **Authentication endpoints:**
   - `/api/auth/login`
   - `/api/auth/logout`
   - `/api/auth/signup` (disabled anyway)

2. **Verification endpoints:**
   - `/api/auth/verify-email`
   - `/api/auth/resend-verification`
   - `/api/invitations/accept`

3. **Public endpoints:**
   - `/api/health`
   - `/api/status`

## Client-Side Handling

When an API returns `verificationRequired: true`:

```typescript
// In your React component
const response = await fetch('/api/some-endpoint');
const data = await response.json();

if (data.verificationRequired) {
  // Redirect to verification page
  router.push('/auth/verify-email-required');
}
```

## Scheduled Cleanup

Add this to your cron jobs or scheduled functions:

```typescript
import { cleanupUnverifiedAccounts } from '@/lib/auth/email-verification';

// Run daily to delete unverified accounts older than 7 days
export async function scheduledCleanup() {
  const result = await cleanupUnverifiedAccounts(7);
  console.log(`Cleaned up ${result.deleted} unverified accounts`);
}
```

## Security Benefits

1. **No zombie accounts** - Unverified accounts are automatically cleaned up
2. **Strong enforcement** - Every protected route checks verification
3. **Audit trail** - All verification attempts are logged
4. **User-friendly** - Clear messages guide users to verify

## Migration Checklist

- [ ] Update all protected API routes to use `requireVerifiedUser`
- [ ] Add cleanup job to remove old unverified accounts
- [ ] Update client to handle `verificationRequired` responses
- [ ] Test email verification flow end-to-end
- [ ] Monitor logs for verification failures

## Example: Converting an API Route

### Before:
```typescript
export async function GET(req: NextRequest) {
  const user = await getServerToken(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  // Your API logic here
  return NextResponse.json({ data: 'protected data' });
}
```

### After:
```typescript
import { requireVerifiedUser } from '@/lib/auth/email-verification';

export async function GET(req: NextRequest) {
  const { user, error } = await requireVerifiedUser(req, getServerToken);
  if (error) return error;
  
  // Your API logic here - user is verified!
  return NextResponse.json({ data: 'protected data' });
}
```

This ensures no unverified user can access protected resources.