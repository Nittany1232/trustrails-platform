# Custodian Management System Documentation

## Overview
The TrustRails Custodian Management System provides comprehensive tools for managing financial institutions (custodians) and their users, with role-based access control, audit logging, and real-time status monitoring.

## Key Components

### 1. Reusable Components

#### CustodianProfileEditor (`/components/custodian/CustodianProfileEditor.tsx`)
A unified component for editing custodian profiles that works for both custodian users and administrators.

**Features:**
- Editable company information (Tax ID, SEC registration, website, contact details)
- Operational settings (settlement type, timeframe, wallet preferences)
- Transfer limits configuration
- Role-based visibility (admins see additional fields like verification status)
- Real-time validation and error handling
- Audit event creation on all changes

**Usage:**
```tsx
<CustodianProfileEditor
  custodian={custodian}
  currentUser={currentUser}
  isAdmin={true}  // Shows admin-only fields
  onUpdate={(updated) => handleUpdate(updated)}
/>
```

#### CustodianStatusManager (`/components/custodian/CustodianStatusManager.tsx`)
Admin-only component for managing custodian activation and verification status.

**Features:**
- Toggle system access (active/inactive)
- Toggle KYB verification status
- Confirmation dialogs for critical actions
- Cascade deactivation of all users when custodian is deactivated
- Real-time status impact information
- Comprehensive audit logging

**Key Controls:**
- **Active Status**: Controls system access for custodian and all its users
- **Verified Status**: Indicates KYB compliance completion

#### CustodianManagementTab (`/components/admin/CustodianManagementTab.tsx`)
Comprehensive admin dashboard tab for managing all custodians.

**Features:**
- Statistics overview (total, active, verified, with wallets)
- Searchable custodian table with status indicators
- Quick actions dropdown menu
- Detailed view with tabs (Profile, Admin Controls, Users, Activity)
- Real-time data refresh

### 2. API Endpoints

#### Status Management
- `POST /api/admin/custodian/status` - Update custodian active status
  - Requires admin authentication
  - Cascade deactivates users when custodian is deactivated
  - Creates comprehensive audit logs

#### Existing Endpoints
- `POST /api/custodians/activate` - Activate custodian (checks document verification)
- `POST /api/custodians/verify-financial` - Verify financial details
- `POST /api/admin/users/activate` - Activate user
- `POST /api/admin/users/deactivate` - Deactivate user

### 3. Status Flag Clarification

#### Custodian Flags
| Flag | Type | Controlled By | Purpose | Visible To |
|------|------|--------------|---------|------------|
| `isActive` | boolean | Admin | System access control | Everyone |
| `isVerified` | boolean | Admin | KYB compliance status | Admin only |
| `status` | string | System | Workflow status | Everyone |

#### User Flags
| Flag | Type | Controlled By | Purpose |
|------|------|--------------|---------|
| `isActive` | boolean | Admin/Custodian | User access control |
| `role` | string | Admin | Permission level |

### 4. Audit System

#### Audit Helper Functions (`/lib/audit.ts`)
Comprehensive audit logging utilities for compliance and tracking.

**Key Functions:**
- `createAuditEvent()` - Creates immutable audit events
- `getCustodianAuditEvents()` - Retrieves custodian-specific events
- `getUserAuditEvents()` - Retrieves user-specific events
- `formatAuditEvent()` - Formats events for display
- `getCustodianActivitySummary()` - Generates activity summaries

**Event Types:**
```typescript
// Custodian Events
custodian.profile_updated
custodian.activated
custodian.deactivated
custodian.verified
custodian.unverified

// User Events
user.activated
user.deactivated
USER_DEACTIVATED_CASCADE  // When custodian deactivation triggers user deactivation
```

### 5. Real-time Status Monitoring

#### useUserStatusCheck Hook (`/hooks/useUserStatusCheck.ts`)
Monitors user and custodian status changes in real-time and forces logout when deactivated.

**Features:**
- Real-time Firestore listeners for status changes
- Automatic logout on deactivation
- Toast notifications with deactivation reasons
- Window focus status check
- Cascade logout when custodian is deactivated

**Implementation:**
```tsx
// Automatically included via AuthStatusProvider
<AuthStatusProvider>
  {/* Your app content */}
</AuthStatusProvider>
```

## Access Control Matrix

| Feature | Custodian User | Admin |
|---------|---------------|-------|
| View own custodian profile | ✅ | ✅ |
| Edit custodian profile | ✅ | ✅ |
| View verification status | ❌ | ✅ |
| Change active status | ❌ | ✅ |
| Change verified status | ❌ | ✅ |
| View all custodians | ❌ | ✅ |
| Activate/deactivate users | ✅ (own only) | ✅ (all) |
| View audit logs | ✅ (own only) | ✅ (all) |

## Implementation Workflow

### 1. Custodian Editing Their Own Profile
```
User → /settings/custodian → CustodianProfileEditor → API → Audit Event
```

### 2. Admin Managing Custodian
```
Admin → /admin/dashboard → CustodianManagementTab → Details View → 
  → CustodianProfileEditor (Profile Tab)
  → CustodianStatusManager (Admin Controls Tab)
  → API → Audit Events
```

### 3. Status Change Cascade
```
Admin deactivates custodian →
  → Update custodian.isActive = false
  → Find all users with custodianId
  → Update all users.isActive = false
  → Create audit logs for each action
  → Real-time listeners trigger logout
  → Users redirected to login page
```

## Security Considerations

1. **Authentication Required**: All endpoints require proper authentication
2. **Role Verification**: Admin actions require admin role verification
3. **Audit Trail**: All changes create immutable audit events
4. **Real-time Enforcement**: Status changes immediately affect active sessions
5. **Cascade Protection**: Deactivating custodian affects all associated users
6. **Data Validation**: All inputs validated before database updates

## Database Schema

### Custodian Collection
```typescript
{
  id: string;
  name: string;
  type: 'bank' | 'brokerage' | 'ria';
  isActive: boolean;      // Admin-controlled
  isVerified: boolean;    // Admin-controlled
  status: string;         // Workflow status
  // Profile fields...
  deactivatedBy?: string;
  deactivatedAt?: Timestamp;
  deactivationReason?: string;
  lastUpdatedBy: string;
  lastUpdatedAt: Timestamp;
}
```

### Audit Log Collection
```typescript
{
  action: string;
  adminId: string;
  adminEmail: string;
  targetCustodianId?: string;
  targetUserId?: string;
  reason: string;
  timestamp: Timestamp;
  metadata: {
    previousStatus: string;
    newStatus: string;
    cascadeFrom?: string;
  }
}
```

## Testing Checklist

### Functional Tests
- [ ] Custodian can edit their own profile
- [ ] Admin can edit any custodian profile
- [ ] Admin can activate/deactivate custodians
- [ ] Admin can verify/unverify custodians
- [ ] Deactivating custodian logs out all users
- [ ] Audit events created for all actions
- [ ] Search and filtering work correctly
- [ ] Real-time status updates reflected immediately

### Security Tests
- [ ] Non-admin cannot access admin endpoints
- [ ] Custodian users cannot see other custodians
- [ ] Deactivated users cannot login
- [ ] Active sessions terminated on deactivation
- [ ] Audit logs are immutable
- [ ] Verification status hidden from non-admins

### Performance Tests
- [ ] Real-time listeners don't cause memory leaks
- [ ] Large custodian lists render efficiently
- [ ] Audit queries perform well with large datasets
- [ ] Status checks don't impact page load times

## Monitoring and Maintenance

### Key Metrics to Track
- Average time to activate/verify custodians
- Number of deactivation events
- User logout success rate on deactivation
- Audit log query performance
- Real-time listener connection stability

### Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| Users not logged out on deactivation | Check Firebase Auth token revocation |
| Audit events missing | Verify event creation in API endpoints |
| Status not updating in real-time | Check Firestore listener connections |
| Performance degradation | Implement pagination for large datasets |

## Future Enhancements

1. **Bulk Operations**: Select multiple custodians for bulk status changes
2. **Scheduled Deactivation**: Set future deactivation dates
3. **Compliance Reporting**: Generate KYB compliance reports
4. **API Rate Limiting**: Prevent abuse of status change endpoints
5. **Email Notifications**: Notify users of status changes
6. **Two-Factor Confirmation**: Require 2FA for critical admin actions
7. **Status History Timeline**: Visual timeline of all status changes
8. **Role-based Dashboards**: Customized views based on user role

## Related Documentation

- [Firebase & Data Connect Documentation](../FIREBASE_DATA_CONNECT_DOCUMENTATION.md)
- [Authentication Architecture](./AUTHENTICATION_ARCHITECTURE.md)
- [Audit System Documentation](./AUDIT_SYSTEM.md)
- [Admin Dashboard Guide](./ADMIN_DASHBOARD_GUIDE.md)