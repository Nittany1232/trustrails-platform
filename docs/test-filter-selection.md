# Filter Selection Behavior Test

## Test Cases for Manual vs Automatic Filter Changes

### Test Case 1: Manual Filter Click
**Expected Behavior**: Select first transfer in the clicked filter

**Steps**:
1. User clicks "Preparation" filter pill
2. `setFilterStatusFromUser('preparation')` is called
3. `lastUserFilterChangeRef.current` is set to current timestamp
4. Auto-select logic detects recent manual change (< 1000ms)
5. First transfer in preparation filter is automatically selected

**Console Output**:
```
[User Action] Manual click on Preparation filter
[Manual Filter] User clicked preparation filter - will auto-select first transfer
[Auto-select] Manual filter change detected, selecting first transfer in new filter
```

### Test Case 2: Smart Following (Automatic)
**Expected Behavior**: Keep current selection when transfer moves to new phase

**Steps**:
1. Transfer moves from "preparation" to "execution" phase
2. Smart following detects the change
3. `setFilterStatusFromSmartFollowing('execution', rolloverId)` is called
4. `isSmartFollowing` is set to true
5. Filter changes to "execution" but selection is preserved
6. Auto-select logic skips because `isSmartFollowing` is true

**Console Output**:
```
🎯 Smart filter following: rollover abc123 moved from preparation to execution
[Smart Follow] Auto-switching to execution filter to follow rollover abc123 - preserving selection
[Auto-select] Smart following - found target rollover in new filter: abc123
```

## Implementation Details

### Key Functions:

1. **setFilterStatusFromUser()** - For manual clicks
   - Sets timestamp to track user action
   - Clears smart following state
   - Triggers auto-selection of first transfer

2. **setFilterStatusFromSmartFollowing()** - For automatic changes
   - Sets smart following flags
   - Preserves current selection
   - Prevents auto-selection

3. **Auto-select Logic** - Decides what to select
   - Checks if change was recent manual action
   - Respects smart following flags
   - Falls back to keeping current selection or selecting first item

### Filter Pill Implementation:
```typescript
onClick={() => {
  if (!loading) {
    console.log('[User Action] Manual click on Preparation filter');
    setFilterStatusFromUser('preparation');
  }
}}
```

This implementation provides clear distinction between manual user actions and automatic system behavior, ensuring the correct selection behavior in each case.