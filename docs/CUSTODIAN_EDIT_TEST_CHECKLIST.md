# Custodian Profile Edit Testing Checklist

## Implementation Status ✅

### Backend Implementation
- ✅ Created `/app/api/custodians/[custodianId]/route.ts` with PATCH endpoint
- ✅ Implemented proper authentication checks (admin and custodian_user roles)
- ✅ Added AuditLogger.logAdminAction for SOC2 compliant logging
- ✅ Logs to Cloud Logging (NOT Firebase) per CLAUDE.md architecture
- ✅ Includes custodianId at top level for filtering
- ✅ Captures previous values and new values for audit trail
- ✅ Records which fields were updated

### Client-Side Implementation  
- ✅ Updated `updateCustodianProfile` in `/lib/custodians.ts` to use API endpoint
- ✅ Removed direct Firestore writes from client
- ✅ Settings page uses the updated function
- ✅ Proper error handling in place

### Audit Logging Architecture
- ✅ Administrative events go to Cloud Logging (SOC2 compliance)
- ✅ Transaction events stay in Firebase 'events' collection
- ✅ Unified API combines both sources
- ✅ custodianId included for proper filtering

## Test Scenarios

### 1. Admin Editing Custodian Profile
**Steps:**
1. Log in as admin (RZPdEIN7UbfLl8G3VeJVOBR4Iuv1)
2. Go to Admin > Monitoring
3. Find tokenization-test-custodian-1
4. Click Edit Profile button
5. Change:
   - Website URL
   - Tax ID
   - Max Transfer Limit
6. Save changes

**Expected Results:**
- ✅ Changes saved successfully
- ✅ Event logged to Cloud Logging with:
  - eventType: "custodian.profile.updated"
  - category: "administrative"
  - userId: admin's ID
  - userRole: "admin"
  - custodianId: "tokenization-test-custodian-1"
  - updatedFields: array of changed fields
  - previousValues: old values
  - newValues: new values
- ✅ Event appears in Administrative filter
- ✅ Event visible to all admins

### 2. Custodian User Editing Own Profile
**Steps:**
1. Log in as tokenization-test-user-1 (custodian user)
2. Go to Settings > Organization
3. Click Edit Profile
4. Change:
   - Website URL
   - SEC Registration
   - Settlement Type
5. Save changes

**Expected Results:**
- ✅ Changes saved successfully
- ✅ Event logged to Cloud Logging with:
  - eventType: "custodian.profile.updated"
  - category: "administrative"
  - userId: custodian user's ID
  - userRole: "custodian_user"
  - custodianId: "tokenization-test-custodian-1"
- ✅ Event appears in Administrative filter (only for their custodian)
- ✅ Custodian cannot see other custodians' events

### 3. Verification Script
**Run after making edits:**
```bash
GOOGLE_APPLICATION_CREDENTIALS=/home/stock1232/projects/trustrails/credentials/firebase-admin.json \
node scripts/test-custodian-edit-logging.js
```

**Should show:**
- Cloud Logging entries for custodian.profile.updated
- Proper filtering by custodianId
- Correct user attribution
- Changed fields and values

## Filter Testing

### Administrative Filter (Admin View)
- Should show ALL custodian profile edits
- Should show edits from all users (admin and custodian users)
- Should show all custodians

### Administrative Filter (Custodian View)  
- Should ONLY show edits for their custodian
- Should NOT show other custodians' events
- Should show both their edits and admin edits to their profile

## Key Points to Verify

1. **Event Location**: Events MUST be in Cloud Logging, NOT Firebase 'events' collection
2. **Event Type**: Must be "custodian.profile.updated"
3. **Category**: Must be "administrative"
4. **Custodian ID**: Must be included at top level for filtering
5. **User Attribution**: Correct userId and userRole
6. **Audit Trail**: Previous and new values captured
7. **Filter Isolation**: Custodians only see their own events

## Success Criteria

✅ Admin can edit any custodian profile
✅ Custodian users can edit only their own profile
✅ All edits create Cloud Logging events
✅ Events appear in Administrative filter
✅ Custodian filter shows only their events
✅ Audit trail includes all changed fields
✅ No events in Firebase 'events' collection
✅ SOC2 compliance maintained