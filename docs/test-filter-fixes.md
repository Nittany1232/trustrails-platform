# Test Plan: Filter Click and Smart Follow Fixes

## Summary of Changes Made

### 1. Fixed Filter Click Behavior
**Problem**: Filter clicks didn't always select the first transfer in that filter.

**Solution**: 
- Added `shouldSelectFirstInFilter` ref to track manual filter clicks
- Modified `setFilterStatusFromUser` to set this flag and clear smart following state
- Updated auto-select logic with priority system:
  1. **PRIORITY 1**: Force select first item if user manually clicked filter
  2. **PRIORITY 2**: Smart following - maintain selection of followed rollover  
  3. **PRIORITY 3**: Keep current selection if it exists in new filter
  4. **PRIORITY 4**: No selection - select first item

### 2. Fixed Smart Follow Logic
**Problem**: Smart follow wasn't working for initiation→preparation and preparation→execution transitions.

**Solutions**:
- Enhanced transition detection to check both phase mismatch AND transitioning states
- Added specific states to trigger smart follow: `'acknowledged', 'in_progress', 'awaiting_approval', 'awaiting_financial_verification', 'documents_complete', 'awaiting_sender', 'awaiting_receiver', 'ready_to_record', 'transfer_recorded', 'processing_record', 'awaiting_funds'`
- Reduced user action buffer from 2 seconds to 1 second for more responsive smart follow
- Added `getCurrentPhase` to dependencies to ensure fresh phase calculations

### 3. Added Enhanced Debugging
- Action debug logging to track phase transitions
- Optimistic update logging
- Phase transition detection with visual indicators

## Test Cases to Verify

### Test Case 1: Manual Filter Click Always Selects First Transfer
**Steps**:
1. Have multiple transfers in different phases
2. Select a transfer in the "Execution" filter
3. Click "Preparation" filter pill
4. **Expected**: First transfer in preparation filter should be selected
5. **Check console**: Should see `[Auto-select] Manual filter click detected - selecting first item in preparation filter`

### Test Case 2: Smart Follow for Acknowledge Action (Initiation → Preparation)
**Steps**:
1. Select a transfer in "Initiation" phase (state: 'started')
2. Click "Acknowledge" action
3. **Expected**: Filter should automatically switch to "Preparation" and same transfer should remain selected
4. **Check console**: Should see:
   - `[Action Debug] Before acknowledge_receipt: rollover xxx in phase initiation`
   - `[Action Debug] Optimistic update: initiation → preparation`
   - `🎯 Smart filter following: rollover xxx moved from initiation to preparation`
   - `🔍 Smart following activated: tracking rollover xxx from initiation to preparation`

### Test Case 3: Smart Follow for Blockchain Actions (Preparation → Execution)
**Steps**:
1. Select a transfer in "Preparation" phase with both parties agreed
2. Click "Execute Transfer" or "Provide Financial Details" action
3. **Expected**: Filter should automatically switch to "Execution" and same transfer should remain selected
4. **Check console**: Should see smart follow activation messages

### Test Case 4: Filter Clicks Don't Interfere with Smart Follow
**Steps**:
1. Start an action that triggers a phase transition
2. Immediately click a different filter before the transition completes
3. **Expected**: Manual filter click should take precedence, selecting first item in clicked filter
4. **Check console**: Should see manual filter click message overriding smart follow

### Test Case 5: Smart Follow Timing
**Steps**:
1. Select a transfer and trigger an action
2. Wait for the action to complete and phase transition to occur
3. **Expected**: Smart follow should activate within 1-2 seconds after the action completes
4. **Check console**: Should see phase transition detection and smart follow activation

## Console Debug Messages to Look For

### Filter Click Success:
```
[Filter Click] User manually clicked preparation filter
[Auto-select] Manual filter click detected - selecting first item in preparation filter
```

### Smart Follow Success:
```
[Action Debug] Before acknowledge_receipt: rollover abc123... in phase initiation
[Action Debug] Optimistic update: initiation → preparation
[Smart Follow] Checking rollover abc123...
  Current filter: initiation
  Rollover phase: preparation
  State: acknowledged
🎯 Smart filter following: rollover abc123 moved from initiation to preparation
🔍 Smart following activated: tracking rollover abc123 from initiation to preparation
[Auto-select] Smart follow - found followed rollover in new filter, selecting it: abc123...
🔍 Smart following success: rollover abc123... is selected in preparation filter
```

### Phase Transition Detection:
```
[Action Debug] 🚀 Phase transition detected: initiation → preparation
[Action Debug] Smart follow should trigger if this rollover is selected
```

## Known Issues to Watch For

1. **Timing Issues**: If smart follow doesn't trigger, check if the 1-second user action buffer is interfering
2. **Cache Issues**: If phase changes aren't detected, verify cache clearing is working
3. **State Mapping**: If wrong phases are detected, check the getCurrentPhase state mapping logic
4. **Race Conditions**: If both filter click and smart follow trigger, manual clicks should take priority

## Success Criteria

✅ **Filter clicks ALWAYS select first transfer in that filter**
✅ **Smart follow works for ALL phase transitions** 
✅ **Manual filter clicks take priority over smart follow**
✅ **No conflicts between the two features**
✅ **Responsive UI updates within 1-2 seconds**
