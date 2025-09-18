# Pagination Implementation - Hierarchical Search Widget

## Overview

Successfully implemented a simple and clean "Load More" pagination solution for the hierarchical search widget to handle large result sets (84,760+ plans in BigQuery).

## Implementation Details

### Key Features

1. **Simple Load More Button**: Clean, accessible button that loads additional results
2. **Results Counter**: Shows "Showing X of Y results" to give users context
3. **Loading States**: Smooth loading indicators for both initial search and "load more"
4. **Edge Case Handling**: Proper handling of no more results, errors, and API limitations
5. **Accessibility**: Keyboard navigation support and ARIA labels
6. **Mobile-Friendly**: Works well on small screens

### Technical Implementation

#### State Management
- `currentOffset`: Tracks pagination offset for API calls
- `hasMoreResults`: Boolean flag to show/hide Load More button
- `loadingMore`: Separate loading state for pagination
- `totalResults`: Total result count from API
- `resultsPerPage`: Configurable page size (default: 10)

#### API Integration
- Uses existing `limit` and `offset` parameters
- Handles both totalCount from API and fallback estimation
- Graceful degradation when totalCount is not available

#### UI Components
```typescript
// Results info
<div class="results-info">
  Showing ${this.searchResults.length} of ${this.totalResults.toLocaleString()} results
</div>

// Load More button
<button class="load-more-button" @click=${this.loadMoreResults}>
  Load More Results
</button>

// Loading state
<div class="loading-more">
  🔍 Loading more results...
</div>

// End state
<div class="no-more-results">
  ✓ All results loaded
</div>
```

### CSS Styling

All pagination elements follow the existing themeable design system:

- Uses CSS variables for consistent theming
- Smooth transitions and hover effects
- Proper focus states for accessibility
- Mobile-responsive design

### Edge Cases Handled

1. **No More Results**: Shows "All results loaded" message
2. **API Errors**: Different error messages for initial search vs. load more
3. **Empty Results**: Clear "No results found" message
4. **Loading States**: Prevents double-clicks during loading
5. **Total Count Fallback**: Works even if API doesn't provide totalCount

## Usage Example

```html
<!-- Widget automatically handles pagination -->
<trustrails-hierarchical-search
  api-endpoint="https://api.trustrails.com"
  theme="default">
</trustrails-hierarchical-search>
```

Search flow:
1. User searches for "American"
2. Widget shows first 10 results with "Showing 10 of 1,247 results"
3. User clicks "Load More Results"
4. Widget fetches next 10 results and appends to list
5. Button updates to "Showing 20 of 1,247 results"
6. Process continues until all results loaded

## Performance Considerations

- **Incremental Loading**: Only loads data when requested
- **Memory Efficient**: Results accumulate in browser (acceptable for widget use case)
- **API Friendly**: Respects backend limit of 100 results per request
- **Network Optimized**: Minimal payload per request

## Accessibility Features

- **Keyboard Navigation**: Full keyboard support
- **Screen Reader Support**: Proper ARIA labels and live regions
- **Focus Management**: Clear focus indicators
- **Status Updates**: Loading states announced to screen readers

## Browser Compatibility

Works in all modern browsers that support Web Components:
- Chrome 54+
- Firefox 63+
- Safari 10.1+
- Edge 79+

## Future Enhancements

Potential improvements for future versions:

1. **Virtual Scrolling**: For very large result sets
2. **Search Filtering**: Client-side filtering of loaded results
3. **Result Grouping**: Group by custodian or location
4. **Infinite Scroll**: Automatic loading on scroll (if needed)
5. **Result Caching**: Client-side caching of search results

## Testing

The implementation has been tested with:
- ✅ TypeScript compilation
- ✅ Vite build process
- ✅ Widget demo application
- ✅ Error handling scenarios
- ✅ Accessibility features

## Files Modified

- `/packages/rollover-widget/src/hierarchical-search-widget.ts`: Main implementation
- Build outputs updated automatically

The pagination solution is production-ready and maintains the widget's core principles of simplicity, accessibility, and embedded-friendly design.