# TrustRails Health Monitoring System

## Overview

The TrustRails health monitoring system provides real-time system status tracking for SOC 2 compliance and operational visibility. The system monitors 6 critical components and calculates overall system availability.

## Architecture

- **Endpoint**: `/api/admin/health/detailed`
- **Authentication**: Admin-only access required
- **Rate Limiting**: 10 requests per minute per user/IP
- **Caching**: No caching (real-time data)
- **Logging**: All health checks logged for SOC 2 audit trails

## Monitored Components

### 1. Firestore Database
**What it tests:**
- Attempts to read `config/system` document
- Measures database connection latency

**Health Thresholds:**
- ✅ **Healthy**: Response time < 1000ms
- ⚠️ **Degraded**: Response time ≥ 1000ms
- ❌ **Critical**: Connection failed or exception thrown

**Data Returned:**
```json
{
  "name": "Firestore Database",
  "status": "healthy",
  "responseTime": 245,
  "details": {
    "connected": true,
    "readable": true,
    "latency": "245ms"
  }
}
```

### 2. Firebase Auth
**What it tests:**
- Calls `adminAuth.getUser('test-health-check')` to test auth service
- Expected to fail gracefully (user doesn't exist)

**Health Thresholds:**
- ✅ **Healthy**: Response time < 500ms
- ⚠️ **Degraded**: Response time ≥ 500ms OR any error
- ❌ **Critical**: Never (auth failures are graceful)

**Data Returned:**
```json
{
  "name": "Firebase Auth",
  "status": "healthy",
  "responseTime": 156,
  "details": {
    "service": "operational",
    "tokenVerification": "available",
    "latency": "156ms"
  }
}
```

### 3. Blockchain (Arbitrum Sepolia) ⚠️ TEST NETWORK
**What it tests:**
- Fetches current block number from Arbitrum Sepolia testnet
- Verifies V6 contract exists at `0x4863545df984dF561fcaA0Bff6B5b01F2d6B52C6`
- Uses RPC: `https://sepolia-rollup.arbitrum.io/rpc`

**Health Thresholds:**
- ✅ **Healthy**: Response < 2000ms AND contract exists
- ⚠️ **Degraded**: Response ≥ 2000ms OR contract missing
- ❌ **Critical**: RPC connection failed

**Data Returned:**
```json
{
  "name": "Blockchain (Arbitrum)",
  "status": "healthy",
  "responseTime": 1234,
  "details": {
    "network": "Arbitrum Sepolia",
    "blockNumber": 12345678,
    "v6Contract": "deployed",
    "latency": "1234ms"
  }
}
```

**⚠️ Note**: This is testing the **Arbitrum Sepolia testnet**, not mainnet.

### 4. System Resources ⚠️ DEV SERVER
**What it tests:**
- Node.js process memory usage via `process.memoryUsage()`
- Process uptime via `process.uptime()`
- Assumes 2GB memory limit for deployment

**Health Thresholds:**
- ✅ **Healthy**: Memory usage < 80% of 2GB limit
- ⚠️ **Degraded**: Memory usage ≥ 80%
- 🔍 **Unknown**: Process metrics unavailable

**Memory Calculation:**
```javascript
const memUsage = process.memoryUsage();
const memoryLimit = 2 * 1024 * 1024 * 1024; // 2GB assumption
const memoryUsagePercent = (memUsage.heapUsed / memoryLimit) * 100;
```

**Data Returned:**
```json
{
  "name": "System Resources",
  "status": "healthy",
  "responseTime": 2,
  "details": {
    "memoryUsage": "45%",
    "heapUsed": "923MB",
    "uptime": "127min",
    "pid": 12345
  }
}
```

**⚠️ Note**: This monitors the **development server** process, not production infrastructure.

### 5. ETL Pipeline
**What it tests:**
- Queries `etl_processed` collection for most recent ETL run
- Checks if last run was within 1 hour

**Health Thresholds:**
- ✅ **Healthy**: ETL ran within last hour
- ⚠️ **Degraded**: ETL data is stale (> 1 hour old)
- 🔍 **Unknown**: Cannot query ETL status

**Data Returned:**
```json
{
  "name": "ETL Pipeline",
  "status": "healthy",
  "responseTime": 89,
  "details": {
    "lastRun": "2025-09-09T15:30:00.000Z",
    "status": "active"
  }
}
```

### 6. Cloud Logging
**What it tests:**
- Verifies `GOOGLE_CLOUD_PROJECT` or `NEXT_PUBLIC_FIREBASE_PROJECT_ID` environment variables
- **Does NOT test actual Google Cloud Logging API**

**Health Thresholds:**
- ✅ **Healthy**: Project ID environment variable exists
- ⚠️ **Degraded**: No project ID configured
- 🔍 **Unknown**: Check process failed

**Data Returned:**
```json
{
  "name": "Cloud Logging",
  "status": "healthy",
  "responseTime": 1,
  "details": {
    "configured": true,
    "projectId": "trustrails-faa3e",
    "latency": "1ms"
  }
}
```

## Overall Health Calculation

### Status Determination
```javascript
const criticalCount = components.filter(c => c.status === 'critical').length;
const degradedCount = components.filter(c => c.status === 'degraded').length;

let overallStatus = 'healthy';
if (criticalCount > 0) {
  overallStatus = 'critical';
} else if (degradedCount > 1) {  // More than 1 degraded = overall degraded
  overallStatus = 'degraded';
}
```

### Availability Calculation
```javascript
const healthyCount = components.filter(c => c.status === 'healthy').length;
const totalCount = components.length; // 6 components
const baseAvailability = (healthyCount / totalCount) * 100;

// Add realistic variance (98-100% range)
const variance = Math.random() * 2; // 0-2% variance
const availability = Math.min(100, Math.max(98, 
  baseAvailability + (Math.random() > 0.5 ? variance : -variance)
));
```

**Example**: 5 of 6 components healthy = 83.33% base, but minimum 98% floor applied.

## Issues with Current Implementation

### 1. Threshold Standards Source
The health thresholds appear to be **arbitrary estimates** rather than industry standards:

- **Firestore 1000ms**: Should be closer to 100-200ms for good performance
- **Auth 500ms**: Should be closer to 200-300ms
- **Blockchain 2000ms**: Very lenient, should be 500-1000ms
- **Memory 80%**: Standard, but 2GB assumption may be wrong

### 2. Environment-Specific Issues

**System Resources (Dev Server)**:
- Monitors development Node.js process, not production infrastructure
- 2GB memory limit is a guess, not based on actual deployment specs
- Process uptime resets on every dev server restart

**Blockchain (Test Network)**:
- Tests Arbitrum Sepolia testnet, not production network
- May have different performance characteristics than mainnet

### 3. Missing Historical Tracking

Currently **no historical data is stored**. The comment about "Store health metrics for historical tracking" (line 315) only logs critical states to console, doesn't actually store metrics.

## Recommendations

### 1. Fix Thresholds
```javascript
// Suggested realistic thresholds
const thresholds = {
  firestore: { healthy: 200, degraded: 500 },      // < 200ms = healthy
  auth: { healthy: 300, degraded: 800 },           // < 300ms = healthy  
  blockchain: { healthy: 1000, degraded: 3000 },   // < 1s = healthy
  memory: { healthy: 70, degraded: 85 }            // < 70% = healthy
};
```

### 2. Add Historical Tracking
Create a `system_health_history` collection to store daily health snapshots for uptime tracking visualization.

### 3. Environment-Aware Monitoring
- Use different thresholds for dev vs production
- Monitor actual deployment resources, not dev server
- Test production blockchain networks

## SOC 2 Compliance Features

- **CC7.1 - System Monitoring**: Real-time component health tracking
- **CC7.2 - Audit Logging**: All health checks logged with admin identification
- **A1.1 - Capacity Management**: Memory usage monitoring
- **A1.2 - Recovery Infrastructure**: Component status for incident response

## Historical Health Tracking & Uptime Visualization

### System Health History Collection

Each health check automatically stores a daily snapshot in the `system_health_history` Firestore collection:

```javascript
// Storage logic in /api/admin/health/detailed
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

await db.collection('system_health_history').doc(today).set({
  date: today,                                    // "2025-09-09"
  timestamp: new Date().toISOString(),           // Last check time
  status: overallStatus,                         // "healthy"|"degraded"|"critical"
  availability: systemHealth.metrics.availability, // 99.85
  avgResponseTime: systemHealth.metrics.avgResponseTime, // 342ms
  memoryUsage: systemHealth.metrics.memoryUsage, // 45%
  components: components.map(c => ({
    name: c.name,
    status: c.status,
    responseTime: c.responseTime
  })),
  checkedBy: user.email                          // Admin who triggered check
}, { merge: true }); // Updates existing daily record
```

### Visual Uptime Tracker Component

#### Data Retrieval
**API Endpoint**: `/api/admin/health/history?days=47`

```javascript
// Returns 47 days of health history with gap filling
const filledHistory = [];
const currentDate = new Date(startDate);

while (currentDate <= endDate) {
  const dateStr = currentDate.toISOString().split('T')[0];
  const existingDay = healthHistory.find(h => h.date === dateStr);
  
  if (existingDay) {
    filledHistory.push(existingDay);
  } else {
    // Fill missing days with 'unknown' status
    filledHistory.push({
      date: dateStr,
      status: 'unknown',
      availability: null,
      avgResponseTime: null,
      memoryUsage: null,
      components: [],
      timestamp: null,
      checkedBy: null
    });
  }
  
  currentDate.setDate(currentDate.getDate() + 1);
}
```

#### Visual Mapping
**Component**: `Tracker.tsx` with `healthHistoryToTrackerData()` converter

```javascript
// Status to color mapping
export const healthStatusToColor = (status: string): string => {
  switch (status) {
    case 'healthy':
    case 'operational':
      return 'bg-emerald-600';    // Green
    case 'degraded':
      return 'bg-yellow-600';     // Yellow  
    case 'critical':
      return 'bg-red-600';        // Red
    default:
      return 'bg-gray-600';       // Gray (unknown/no data)
  }
};

// Convert health history to visual blocks
export const healthHistoryToTrackerData = (healthHistory: any[]): TrackerData[] => {
  return healthHistory.map((day) => ({
    color: healthStatusToColor(day.status),
    tooltip: `${day.date}: ${day.status} (${day.availability?.toFixed(1)}%)`,
    date: day.date
  }));
};
```

#### Dashboard Integration
**Location**: Admin Dashboard → System Tab

```typescript
// React component in admin dashboard
{healthHistory.length > 0 && (
  <Card className="bg-gray-900 border border-gray-800">
    <CardHeader>
      <CardTitle className="text-gray-200">System Uptime (Last 47 Days)</CardTitle>
      <CardDescription className="text-gray-400">
        Daily system health status
      </CardDescription>
    </CardHeader>
    <CardContent>
      {/* Legend with color codes */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-emerald-600 rounded-sm"></div>
          <span className="text-sm text-gray-400">Healthy</span>
        </div>
        {/* ... other status indicators */}
      </div>
      
      {/* Statistics */}
      <div className="text-sm text-gray-400">
        {healthHistory.filter(h => h.status === 'healthy').length} of {healthHistory.length} days healthy
      </div>
      
      {/* Visual tracker */}
      <Tracker 
        data={healthHistoryToTrackerData(healthHistory)} 
        className="mb-4"
      />
      
      <div className="text-xs text-gray-500">
        Each block represents one day. Hover for details.
      </div>
    </CardContent>
  </Card>
)}
```

### Uptime Calculations

#### 1. **Daily Status Determination**
Each day's status is determined by the **worst component status** from that day's health checks:

```javascript
// Overall status logic from health API
const criticalCount = components.filter(c => c.status === 'critical').length;
const degradedCount = components.filter(c => c.status === 'degraded').length;

let overallStatus = 'healthy';
if (criticalCount > 0) {
  overallStatus = 'critical';        // Any critical = critical day
} else if (degradedCount > 1) {
  overallStatus = 'degraded';        // 2+ degraded = degraded day  
}
// Otherwise = healthy day
```

#### 2. **Historical Uptime Percentage**
Calculated from daily status records:

```javascript
// From /api/admin/health/history response
const summary = {
  totalDays: filledHistory.length,                                    // 47
  healthyDays: filledHistory.filter(d => d.status === 'healthy').length, // 45
  degradedDays: filledHistory.filter(d => d.status === 'degraded').length, // 1
  criticalDays: filledHistory.filter(d => d.status === 'critical').length, // 0
  unknownDays: filledHistory.filter(d => d.status === 'unknown').length,   // 1
  
  // Average availability from days with data
  avgAvailability: filledHistory
    .filter(d => d.availability !== null)
    .reduce((sum, d, _, arr) => sum + d.availability / arr.length, 0)
};

// Uptime calculation
const uptimePercentage = (summary.healthyDays / summary.totalDays) * 100;
// Example: (45 / 47) * 100 = 95.74% uptime
```

#### 3. **Visual Representation**
- **47 blocks** = 47 days of history
- **Block colors**: Direct mapping from daily status
- **Tooltip data**: Shows date, status, and availability percentage
- **Statistics**: "X of Y days healthy" calculation

```javascript
// Visual statistics in dashboard
const healthyDays = healthHistory.filter(h => h.status === 'healthy').length;
const totalDays = healthHistory.length;
const displayText = `${healthyDays} of ${totalDays} days healthy`;
const uptimePercentage = ((healthyDays / totalDays) * 100).toFixed(1);
```

#### 4. **Real-time vs Historical**
- **Real-time availability**: Uses component health with variance (98-100% range)
- **Historical uptime**: Pure calculation from daily status records
- **Different purposes**: 
  - Real-time = current system performance
  - Historical = long-term reliability trends

### Data Retention & Performance

- **Storage**: Daily records in `system_health_history` collection
- **Retention**: Indefinite (Firestore-managed)
- **Query Optimization**: Date range queries with indexing
- **Performance**: Fetches 47 days (~47 documents) efficiently
- **Caching**: No caching (fresh data on each load)

## API Response Format

```json
{
  "status": "healthy",
  "timestamp": "2025-09-09T15:45:30.123Z",
  "uptime": 7634.5,
  "components": [...],
  "metrics": {
    "availability": 99.85,
    "avgResponseTime": 342,
    "memoryUsage": 45,
    "activeConnections": 6
  },
  "soc2": {
    "compliant": true,
    "controls": ["CC7.1", "CC7.2", "A1.1", "A1.2"],
    "lastAudit": "2025-09-09T15:45:30.123Z"
  }
}
```

## Health History API Response Format

```json
{
  "success": true,
  "data": [
    {
      "date": "2025-09-09",
      "timestamp": "2025-09-09T15:45:30.123Z",
      "status": "healthy",
      "availability": 99.85,
      "avgResponseTime": 342,
      "memoryUsage": 45,
      "components": [
        {
          "name": "Firestore Database",
          "status": "healthy",
          "responseTime": 245
        }
      ],
      "checkedBy": "admin@trustrails.com"
    }
  ],
  "summary": {
    "totalDays": 47,
    "healthyDays": 45,
    "degradedDays": 1,
    "criticalDays": 0,
    "unknownDays": 1,
    "avgAvailability": 99.23
  }
}