# Health Monitoring System Documentation

## Overview

The TrustRails platform implements a comprehensive health monitoring system designed to ensure 99.9% uptime for SOC 2 Type II compliance. This document details the current implementation, tracking mechanisms, and data storage architecture.

## System Architecture

### Core Components

1. **HealthCheckService** (`/lib/services/health-check-service.ts`)
   - Orchestrates all health checks
   - Provides basic and detailed health endpoints
   - Calculates overall system health status

2. **Health Monitors**
   - **DatabaseHealthMonitor** - Firestore connectivity and performance
   - **AuthHealthMonitor** - Firebase Auth service availability
   - **BlockchainHealthMonitor** - Arbitrum Sepolia RPC and smart contracts
   - **SystemResourceMonitor** - Server resources (CPU, memory, disk)

3. **API Endpoints**
   - `/api/system/health?mode=basic` - Quick health status
   - `/api/system/health?mode=detailed` - Comprehensive health report (admin only)

## Health Check Details

### 1. Database Health Monitor

**Quick Check:**
- Tests Firestore connectivity by reading a config document
- Threshold: Response within timeout period
- Returns: healthy/critical status

**Detailed Check:**
| Check Type | What It Tests | Thresholds | Degraded If | Critical If |
|------------|---------------|------------|-------------|-------------|
| Connectivity | Read from `config` collection | - | - | Cannot connect |
| Read Performance | Document read latency | 1000ms | >1000ms | - |
| Write Performance | Document write latency | 2000ms | >2000ms | - |
| Collection Access | Access to 7 critical collections | - | Any inaccessible | - |
| ETL Pipeline | Recent activity in last 24h | 24 hours | No recent activity | - |

**Critical Collections Monitored:**
- `users`
- `custodians`
- `events`
- `transfers`
- `rollover_states`
- `analytics`
- `config`

### 2. Authentication Health Monitor

**Quick Check:**
- Tests Firebase Auth by listing 1 user
- Verifies Admin SDK configuration
- Returns: healthy/critical status

**Detailed Check:**
| Check Type | What It Tests | Thresholds | Degraded If | Critical If |
|------------|---------------|------------|-------------|-------------|
| Auth Service | User listing capability | - | - | Service unavailable |
| Token Verification | JWT creation capability | - | Verification issues | - |
| User Database | Query performance | 500ms | >500ms | - |
| Inactive Users | Percentage of inactive users | 10% | >10% inactive | - |
| Rate Limiting | Rate limiter functionality | - | - | Not configured |

### 3. Blockchain Health Monitor

**Quick Check:**
- Tests Arbitrum Sepolia RPC connectivity
- Makes `eth_blockNumber` call
- Returns: healthy/critical status

**Detailed Check:**
| Check Type | What It Tests | Thresholds | Degraded If | Critical If |
|------------|---------------|------------|-------------|-------------|
| RPC Connectivity | Connection to Arbitrum Sepolia | - | - | Cannot connect |
| RPC Latency | Response time for RPC calls | 5000ms | >5000ms | - |
| V6 Contract | Contract code at address | - | No code found | - |
| TRUSD Contract | Contract code at address | - | No code found | - |
| Event Listener | WebSocket monitoring status | - | Not active | - |
| Gas Price | Current network gas price | 10 Gwei | >10 Gwei | - |

**Contract Addresses:**
- V6 Contract: `0x4863545df984dF561fcaA0Bff6B5b01F2d6B52C6`
- TRUSD Token: `0xc067153BefB57a3a15ba4dBfAe44c25BcD8E8aa8`

### 4. System Resource Monitor

Monitors server-side resources:
- CPU usage
- Memory utilization
- Disk space
- Process health

### 5. Cloud Logging Monitor

Verifies Google Cloud Logging configuration:
- Checks `GOOGLE_APPLICATION_CREDENTIALS`
- Tests logging connectivity
- Required for SOC 2 compliance

## Data Tracking and Storage

### Current Implementation Status

| Metric | Tracking Method | Storage Location | Status |
|--------|-----------------|------------------|---------|
| **Real-Time Health** | On-demand checks | Not persisted | ✅ Active |
| **Database Health** | Real-time test | `analytics` collection (test writes only) | ✅ Active |
| **Auth Health** | Real-time test | Not stored | ✅ Active |
| **Blockchain Health** | Real-time RPC calls | Not stored | ✅ Active |
| **ETL Status** | Historical query | `etl_processed`, `etl_failures` | ✅ Active |
| **System Availability** | Real-time calculation | `system_health_metrics` (planned) | ❌ Not Active |
| **Incidents** | Incident tracking | `system_incidents` (planned) | ❌ Not Active |
| **API Access Logs** | Audit logging | Cloud Logging or `api_audit_logs` | ✅ Active |

### Firestore Collections

#### Active Collections
- **`analytics`** - Stores health check test writes
- **`etl_processed`** - Successful ETL runs with timestamps
- **`etl_failures`** - Failed ETL attempts
- **`api_audit_logs`** - API access audit trail (fallback for Cloud Logging)

#### Planned Collections (Infrastructure exists but not active)
- **`system_health_metrics`** - Would store periodic health check results
- **`system_incidents`** - Would track downtime incidents and MTTR

## Availability Calculation

The System Health percentage displayed on the admin dashboard:

```
1. Check critical components (database, auth, blockchain)
2. Count healthy components
3. Base Availability = (Healthy Components / Total Components) × 100
4. Apply 0-2% operational variance
5. Final Range: 98-100% when all healthy
```

## Health Status Levels

| Status | Color | Description | Dashboard Display |
|--------|-------|-------------|-------------------|
| **Healthy** | 🟢 Green | All critical systems operational | 98-100% |
| **Degraded** | 🟡 Yellow | Non-critical issues detected | 85-97% |
| **Critical** | 🟠 Orange | Critical service impaired | 70-84% |
| **Down** | 🔴 Red | Critical service unavailable | <70% |

## SOC 2 Compliance Controls

The health monitoring system validates the following SOC 2 Type II controls:

| Control | Description | Implementation |
|---------|-------------|----------------|
| **CC7.1** | System operations monitoring | Real-time health checks |
| **CC7.2** | Audit logging | Cloud Logging integration |
| **A1.1** | Capacity management | Resource monitoring |
| **A1.2** | Environmental and recovery infrastructure | Blockchain and database monitoring |
| **CC6.1-CC6.3** | Authentication and access controls | Auth service monitoring |

## Enabling Historical Health Tracking

Currently, the system operates in **real-time mode only**. To enable historical tracking:

### 1. Start the Health Check Scheduler

Add to your application initialization:

```typescript
// In your app initialization or a background service
import { HealthCheckScheduler } from '@/lib/services/health-check-scheduler';

const healthScheduler = new HealthCheckScheduler();
healthScheduler.start(); // Runs checks every 5 minutes
```

### 2. Update Availability Calculation

Modify `/lib/services/health-check-service.ts`:

```typescript
private async calculateAvailabilityMetrics() {
  // Query historical data from system_health_metrics
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const metrics = await adminDb
    .collection('system_health_metrics')
    .where('timestamp', '>=', thirtyDaysAgo)
    .orderBy('timestamp', 'desc')
    .get();
  
  // Calculate uptime percentage from historical data
  const totalChecks = metrics.size;
  const healthyChecks = metrics.docs.filter(doc => 
    doc.data().overall === 'up'
  ).length;
  
  const availability = (healthyChecks / totalChecks) * 100;
  
  return {
    current: availability,
    target: 99.9,
    period: 'last_30_days'
  };
}
```

### 3. Create Firestore Indexes

Add to `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "system_health_metrics",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "timestamp", "order": "DESCENDING" },
        { "fieldPath": "overall", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "system_incidents",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "startTime", "order": "DESCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" }
      ]
    }
  ]
}
```

## API Usage Examples

### Basic Health Check
```bash
curl -X GET http://localhost:3000/api/system/health?mode=basic \
  -H "Cookie: auth-token=YOUR_TOKEN"
```

### Detailed Health Check (Admin Only)
```bash
curl -X GET http://localhost:3000/api/system/health?mode=detailed \
  -H "Cookie: auth-token=ADMIN_TOKEN"
```

### Response Examples

**Basic Health Response:**
```json
{
  "status": "healthy",
  "lastCheck": "2025-01-08T10:30:00Z",
  "responseTime": 245
}
```

**Detailed Health Response:**
```json
{
  "overall": {
    "status": "healthy",
    "lastCheck": "2025-01-08T10:30:00Z",
    "responseTime": 1245
  },
  "database": {
    "status": "healthy",
    "responseTime": 123,
    "details": {
      "firestore": {
        "connected": true,
        "readLatency": 45,
        "writeLatency": 89
      },
      "collections": {
        "total": 7,
        "accessible": 7,
        "totalDocuments": 15234
      }
    }
  },
  "authentication": {
    "status": "healthy",
    "details": {
      "tokenVerification": "operational",
      "userDatabase": {
        "totalUsers": 523,
        "activeUsers": 498
      }
    }
  },
  "blockchain": {
    "status": "healthy",
    "details": {
      "network": {
        "name": "Arbitrum Sepolia",
        "chainId": 421614,
        "status": "connected"
      },
      "contracts": {
        "v6Contract": "accessible",
        "trusdContract": "accessible"
      }
    }
  },
  "availability": {
    "current": 99.5,
    "target": 99.9,
    "period": "real_time"
  },
  "compliance": {
    "soc2Type2": true,
    "controls": {
      "CC7.1": "System operations monitoring - Active",
      "CC7.2": "Audit logging - Active"
    }
  }
}
```

## Monitoring Dashboard

The Admin Dashboard at `/admin/dashboard` displays:
- **System Health Card**: Real-time availability percentage
- **Health Status**: Overall system status (Healthy/Degraded/Critical/Down)
- **Target SLA**: 99.9% availability target
- **Monitoring Period**: Currently "real_time", would show "last_30_days" with historical tracking

## Troubleshooting

### Common Issues

1. **System Health shows N/A**
   - Check if admin authentication is working
   - Verify Firebase Admin SDK is initialized
   - Check browser console for API errors

2. **Health checks timing out**
   - Verify RPC URL is configured
   - Check Firebase service account permissions
   - Monitor network connectivity

3. **Degraded performance warnings**
   - Review latency thresholds
   - Check database indexes
   - Monitor RPC provider status

## Future Enhancements

1. **Historical Tracking**: Implement scheduled health checks for trend analysis
2. **Alerting**: Add PagerDuty/Slack integration for critical issues
3. **SLA Reports**: Generate monthly SLA compliance reports
4. **Predictive Analytics**: Use ML to predict potential failures
5. **Multi-region Monitoring**: Add geographic distribution tracking
6. **Custom Metrics**: Allow custom health check definitions

## Security Considerations

- All detailed health checks require admin authentication
- Basic health checks can be exposed for load balancers with `?public=true`
- Rate limiting prevents health check abuse
- Sensitive configuration details are never exposed in responses

## Maintenance

### Regular Tasks
- Review and adjust latency thresholds quarterly
- Clean up old health check test documents from `analytics` collection
- Monitor ETL pipeline health for data freshness
- Verify contract addresses after any blockchain deployments

### Monitoring Best Practices
1. Set up external monitoring (e.g., Datadog, New Relic) 
2. Configure alerts for sustained degraded status
3. Review health metrics during incident post-mortems
4. Maintain runbooks for common health issues

---

*Last Updated: January 2025*
*Version: 1.0.0*