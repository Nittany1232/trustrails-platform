# Firebase Remote Config Setup Instructions

## 🎯 Setup Firebase Remote Config for TrustRails

Your Firebase project is already configured: **trustrails-faa3e**

### Step 1: Access Firebase Console
1. Go to: https://console.firebase.google.com/project/trustrails-faa3e/config
2. Click "Create configuration" if this is your first time

### Step 2: Add Feature Flag Parameters

Add these parameters one by one:

#### Boolean Parameters:
1. **enhanced_blockchain_service**
   - Type: Boolean
   - Default: false
   - Description: "Enable enhanced blockchain service with improved retry logic"

2. **new_state_engine**
   - Type: Boolean  
   - Default: false
   - Description: "Enable new state transition engine with pluggable event mappers"

3. **v6_contracts**
   - Type: Boolean
   - Default: false
   - Description: "Enable V6 blockchain contracts (V5 drop-in replacement)"

4. **enable_optimistic_updates**
   - Type: Boolean
   - Default: true
   - Description: "Enable optimistic UI updates before blockchain confirmation"

#### Numeric Parameters:
5. **blockchain_max_retries**
   - Type: Number
   - Default: 3
   - Description: "Maximum number of retries for blockchain operations"

6. **gas_buffer_percentage**
   - Type: Number
   - Default: 20
   - Description: "Gas estimation buffer percentage to prevent out-of-gas errors"

7. **blockchain_timeout_ms**
   - Type: Number
   - Default: 30000
   - Description: "Timeout for blockchain operations in milliseconds"

8. **migration_rollout_percentage**
   - Type: Number
   - Default: 0
   - Description: "Percentage of users to receive new features during migration"

### Step 3: Set Up Conditions (Optional)

You can add conditions for different environments:

1. **development_environment**
   - Expression: `app.id == 'trustrails-faa3e'`
   - Color: Blue

2. **internal_testing**
   - Expression: `user.email in ['admin@dvcllc.io']`
   - Color: Purple

### Step 4: Test the Configuration

1. Go to your TrustRails app
2. Navigate to: http://localhost:3000/demo/feature-flags
3. You should see your Remote Config values loaded

### Step 5: Enable Development Features

For development, you can override specific flags:

1. In Firebase Console, set these to **true** for development:
   - `enhanced_blockchain_service`: true
   - `new_state_engine`: true
   - `blockchain_max_retries`: 5
   - `gas_buffer_percentage`: 30

### Step 6: Verify Setup

Run this command to test:
```bash
npm test lib/feature-flags/firebase-flags.test.ts
```

All tests should pass with your Firebase configuration.

## 🚀 Quick Start Commands

```bash
# Test the feature flags
npm test lib/feature-flags/

# Start development server
npm run dev

# Visit demo page
open http://localhost:3000/demo/feature-flags
```

Your Firebase project ID is already configured in `.env.local` as: **trustrails-faa3e**