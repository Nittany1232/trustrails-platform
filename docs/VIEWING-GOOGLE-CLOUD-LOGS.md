# 📊 Viewing Google Cloud Audit Logs for TrustRails

## Current Logging Status

### ✅ What IS Being Logged to Google Cloud
Based on the code analysis, the following events are sent to Google Cloud Logging:

1. **Compliance Events** (via `compliance-logger.ts`):
   - Authentication events (login, logout, failed login, password reset, MFA)
   - Data access events (view, export, modify, delete)
   - Security events (unauthorized access, suspicious activity, permission violations)
   - System configuration changes
   - Critical audit events

2. **What is NOT Being Logged to Google Cloud**:
   - **Custodian shell creation activities** - These go to Firebase `custodianAuditLogs` collection
   - Regular user activities from `lib/audit.ts` - These go to Firebase `events` collection
   - Analytics events - These stay in the client-side analytics

### ⚠️ About the Compliance Notice
The notice states: "All custodian shell creation activities are logged for audit purposes."

**This is TRUE**, but the logs are going to **Firebase Firestore**, not Google Cloud Logging:
- Collection: `custodianAuditLogs`
- Includes: custodian ID, action, user ID, timestamp, IP address, user agent, and details

## 📍 Where to View Google Cloud Logs

### Web Console
1. Go to [Google Cloud Console Logs](https://console.cloud.google.com/logs)
2. Select project: `trustrails-faa3e`
3. Use the query builder or enter queries directly

### Key Log Locations
- **Log Name**: `compliance-events`
- **Project**: `trustrails-faa3e`
- **Resource Type**: `global` or `cloud_function`

## 🔍 Useful Queries

### View All Compliance Events
```
logName="projects/trustrails-faa3e/logs/compliance-events"
```

### Filter by Event Type
```
logName="projects/trustrails-faa3e/logs/compliance-events"
jsonPayload.eventType="auth.login"
```

### Filter by User
```
logName="projects/trustrails-faa3e/logs/compliance-events"
jsonPayload.userId="USER_ID_HERE"
```

### Filter by Severity
```
logName="projects/trustrails-faa3e/logs/compliance-events"
severity="CRITICAL"
```

### View Recent Critical Events
```
logName="projects/trustrails-faa3e/logs/compliance-events"
severity="CRITICAL"
timestamp>="2024-01-01T00:00:00Z"
```

### Filter by Time Range (Last 24 hours)
```
logName="projects/trustrails-faa3e/logs/compliance-events"
timestamp>="2024-01-08T00:00:00Z"
```

## 🛠️ Using gcloud CLI

### Prerequisites
```bash
# Install gcloud CLI if not already installed
# https://cloud.google.com/sdk/docs/install

# Authenticate
gcloud auth login

# Set project
gcloud config set project trustrails-faa3e
```

### View Logs from Command Line
```bash
# View recent compliance events
gcloud logging read "logName=projects/trustrails-faa3e/logs/compliance-events" --limit=10

# Filter by severity
gcloud logging read "logName=projects/trustrails-faa3e/logs/compliance-events AND severity=CRITICAL" --limit=10

# Export to JSON
gcloud logging read "logName=projects/trustrails-faa3e/logs/compliance-events" --format=json > audit-logs.json

# Stream logs in real-time
gcloud logging tail "logName=projects/trustrails-faa3e/logs/compliance-events"
```

## 📊 BigQuery Export (If Configured)

If you've set up BigQuery export for long-term storage:

```sql
-- Query audit logs in BigQuery
SELECT 
  timestamp,
  jsonPayload.eventType,
  jsonPayload.userId,
  jsonPayload.action,
  severity
FROM `trustrails-faa3e.audit_logs.compliance_events`
WHERE DATE(timestamp) = CURRENT_DATE()
ORDER BY timestamp DESC
```

## 🔐 Required Permissions

To view logs, your Google account needs one of these roles:
- `roles/logging.viewer` - View logs
- `roles/logging.privateLogViewer` - View all logs including private
- `roles/logging.admin` - Full logging administration

## 📈 Log Metrics and Alerts

### Create a Log-Based Metric
1. Go to [Logs-based Metrics](https://console.cloud.google.com/logs/metrics)
2. Click "Create Metric"
3. Example: Count failed login attempts
   ```
   logName="projects/trustrails-faa3e/logs/compliance-events"
   jsonPayload.eventType="auth.failed_login"
   ```

### Set Up Alerts
1. Go to [Monitoring Alerts](https://console.cloud.google.com/monitoring/alerting)
2. Create alert based on log metrics
3. Example: Alert on >10 failed logins in 5 minutes

## 📋 What's Actually Logged for Custodian Shell Creation

When a custodian shell is created, TWO types of logs are generated:

### 1. Firebase Firestore Log (Main Audit)
**Collection**: `custodianAuditLogs`
```javascript
{
  custodianId: "cust_123",
  action: "custodian_shell_created",
  performedBy: "admin_user",
  timestamp: "2024-01-09T...",
  ipAddress: "127.0.0.1",
  userAgent: "Mozilla/5.0...",
  details: {
    businessName: "Fidelity",
    businessType: "custodian",
    address: {...}
  }
}
```

### 2. Analytics Events (Client-side)
- `custodian_shell_creation` - Form submission
- `custodian_shell_creation_success` - Successful creation
- `custodian_user_invitation_sent` - If invitation sent

## 🚀 To Enable Google Cloud Logging for Custodian Events

If you want custodian shell creation to ALSO go to Google Cloud Logging, you would need to:

1. Import the compliance logger in the API route
2. Add a call to `logComplianceEvent` when creating shells
3. Example modification:

```typescript
// In the custodian creation API
import { logComplianceEvent } from '@/lib/events/compliance-logger';

// After successful creation
await logComplianceEvent({
  eventType: 'custodian.shell_created',
  userId: adminUserId,
  custodianId: newCustodianId,
  action: 'create_shell',
  metadata: {
    businessName: shellData.name,
    businessType: shellData.type
  },
  severity: 'INFO'
});
```

## 📞 Support

For help with logging:
- Google Cloud Support: https://cloud.google.com/support
- Cloud Logging Documentation: https://cloud.google.com/logging/docs
- Project ID: `trustrails-faa3e`