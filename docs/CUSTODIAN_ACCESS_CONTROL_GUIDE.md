# Custodian Access Control Guide

## Understanding Custodian Flags

TrustRails uses multiple flags to control custodian access and capabilities. Understanding these flags is crucial for managing your platform.

## 📋 Flag Definitions

### 1. `status` Field (String)
The primary status indicator for a custodian's lifecycle:

| Value | Meaning | User Access | Can Transact |
|-------|---------|-------------|--------------|
| `"pending"` | Onboarding in progress | ❌ No | ❌ No |
| `"active"` | Fully operational | ✅ Yes* | ✅ Yes |
| `"verified"` | Documents verified, may need wallet | ✅ Yes* | ⚠️ Maybe |
| `"inactive"` | Temporarily disabled | ❌ No | ❌ No |
| `undefined` | Legacy/incomplete data | ❌ No | ❌ No |

*Requires `isActive=true` for actual access

### 2. `isActive` Flag (Boolean)
Controls whether the custodian account is enabled:

| Value | Meaning | Effect |
|-------|---------|--------|
| `true` | Account enabled | Can log in and operate |
| `false` | Account disabled | Cannot log in, suspended |
| `undefined` | Not set | Treated as `false` |

### 3. `isVerified` Flag (Boolean)
Indicates admin verification of documents/identity:

| Value | Meaning | Effect |
|-------|---------|--------|
| `true` | Admin verified | Documents approved |
| `false` | Not verified | Needs verification |
| `undefined` | Not set | Treated as `false` |

### 4. `approvalStatus` Field (String)
Workflow approval state:

| Value | Meaning |
|-------|---------|
| `"pending_review"` | Awaiting admin review |
| `"approved"` | Admin approved |
| `"rejected"` | Application rejected |
| `undefined` | Legacy data |

## 🔐 Access Control Scenarios

### Enable a Custodian for Full Access
```javascript
// To enable a custodian for transactions:
{
  isActive: true,        // Enable login
  isVerified: true,      // Mark as verified
  status: "active",      // Set operational status
  // Ensure wallet exists (platform or BYOW)
}
```

### Temporarily Disable a Custodian
```javascript
// To suspend access temporarily:
{
  isActive: false,       // Disable login
  status: "inactive",    // Mark as inactive
  // isVerified remains unchanged
}
```

### Revoke Verification
```javascript
// To require re-verification:
{
  isVerified: false,     // Remove verification
  status: "pending",     // Back to pending
  // May keep isActive=true for limited access
}
```

### Permanently Disable
```javascript
// To permanently block access:
{
  isActive: false,       // Disable login
  isVerified: false,     // Remove verification
  status: "rejected",    // or "suspended"
}
```

## ⚠️ Current System Issues

### Flag Synchronization Problem
Currently, there's a disconnect between the `status` field and the `isActive`/`isVerified` flags. Many custodians have:
- `status: "active"` but `isActive: false, isVerified: false` (inconsistent)
- `status: "pending"` but `isActive: true, isVerified: true` (Empower case)

### Where Each Flag is Used

**`status` field is checked by:**
- Test pages (blockchain test dropdown)
- Public custodian listings
- Analytics and reporting
- ETL processes

**`isActive`/`isVerified` flags are checked by:**
- User login/session validation
- Admin UI displays
- Access control middleware

## 🛠️ Practical Management

### To Show Custodian in Test Page Dropdown
The test page queries: `status IN ['active', 'verified']`

**Solution:** Ensure `status` is set to either "active" or "verified"

### To Allow User Login
The auth system checks: `isActive === true`

**Solution:** Set `isActive: true`

### To Display as Verified in Admin UI
The admin UI checks: `isVerified === true`

**Solution:** Set `isVerified: true`

## 📊 Current State Summary

As of the latest analysis:
- **15 custodians** have `status: "active"` or `"verified"`
- **6 custodians** have `isActive: true`
- **7 custodians** have `isVerified: true`
- **9 custodians** have problematic flag combinations

## 🔧 Recommended Actions

1. **Immediate:** Run the status synchronization script to align flags
2. **Short-term:** Update the admin API to maintain flag consistency
3. **Long-term:** Standardize on a single source of truth for custodian state

## 📝 Quick Reference Commands

### Check Custodian State
```bash
node scripts/analyze-custodian-flags.js
```

### Fix Status Inconsistencies
```bash
node scripts/fix-empower-status.js
```

### View Active Custodians
Visit: http://localhost:3000/test/blockchain

## 🚨 Important Notes

1. **Always keep flags synchronized** - When changing one flag, update related flags
2. **Test after changes** - Verify login and transaction capabilities work as expected
3. **Document changes** - Log why a custodian was enabled/disabled for audit trail
4. **Check dependencies** - Some features may rely on specific flag combinations

## Flag Combination Matrix

| isActive | isVerified | status | Result |
|----------|------------|--------|--------|
| ✅ true | ✅ true | active | ✅ Full access, appears everywhere |
| ✅ true | ✅ true | verified | ✅ Full access, appears everywhere |
| ✅ true | ✅ true | pending | ⚠️ Can login but won't appear in dropdowns |
| ✅ true | ❌ false | any | ⚠️ Can login but limited features |
| ❌ false | ✅ true | any | ❌ Cannot login |
| ❌ false | ❌ false | active | ⚠️ Appears in dropdowns but cannot login |
| ❌ false | ❌ false | pending | ❌ No access anywhere |

## Contact for Help

If you encounter issues with custodian access control:
1. Check this guide first
2. Run the analysis script to see current state
3. Review the audit logs for recent changes
4. Contact the development team if inconsistencies persist