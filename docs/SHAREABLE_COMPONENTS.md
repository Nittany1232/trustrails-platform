# Shareable Components Documentation

## Overview
This document catalogs reusable components across the TrustRails application, their usage patterns, and implementation guidelines.

## UI Components

### MetricCard
**Location:** `/components/shared/MetricCard.tsx`

A versatile card component for displaying metrics with loading states, trends, and click actions.

**Props:**
```typescript
interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: 'positive' | 'negative' | 'neutral';
  loading?: boolean;
  href?: string;
  variant?: 'default' | 'gradient' | 'minimal';
  colorScheme?: 'purple' | 'green' | 'amber' | 'red' | 'blue' | 'gray';
  className?: string;
  onClick?: () => void;
  showTrendIcon?: boolean;
}
```

**Usage Example:**
```tsx
<MetricCard
  title="System Health"
  value="99.9%"
  subtitle="Operational"
  icon={Activity}
  colorScheme="green"
  loading={false}
  href="/admin/monitoring"
/>
```

**Loading States:**
- Uses Skeleton components for smooth loading transitions
- Prevents flashing during data updates
- Shows skeleton placeholders for value and subtitle

### MetricCardsCarousel
**Location:** `/components/shared/MetricCardsCarousel.tsx`

A responsive carousel for displaying multiple MetricCards with navigation controls.

**Features:**
- Responsive breakpoints (mobile: 1, tablet: 2, desktop: 4 cards)
- Keyboard navigation (arrow keys)
- Touch-friendly navigation buttons
- Dots indicator for position
- Automatic overflow handling

**Usage Example:**
```tsx
<DashboardMetricsCarousel
  cards={[
    { title: "Active Users", value: 150, colorScheme: "green" },
    { title: "Revenue", value: "$45,000", trend: "positive" }
  ]}
/>
```

### Skeleton
**Location:** `/components/ui/skeleton.tsx`

Base skeleton loading component for creating loading placeholders.

**Usage:**
```tsx
<Skeleton className="h-9 w-32" />  // For metric values
<Skeleton className="h-4 w-24" />  // For subtitles
<Skeleton className="h-64 w-full" /> // For charts
```

### StatusBadge
**Location:** `/components/shared/StatusBadge.tsx`

Badge component for displaying status indicators with color coding.

**Variants:**
- `ActiveBadge`: For active/inactive states
- `StatusBadge`: For general status display

**Color Schemes:**
- green: Success/healthy states
- red: Error/critical states
- amber: Warning/degraded states
- blue: Informational
- gray: Neutral/disabled
- purple: Primary actions
- orange: Alerts
- cyan: Special states

### LoadingState (Deprecated)
**Location:** `/components/shared/LoadingState.tsx`

⚠️ **Deprecated:** Use Skeleton components instead for better UX.

## Data Display Components

### FilterBadge
**Location:** `/components/shared/FilterBadge.tsx`

Badge component for displaying active filters in search/filter interfaces.

**Props:**
```typescript
interface FilterBadgeProps {
  label: string;
  value: string;
  onRemove?: () => void;
  colorScheme?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray';
}
```

## Loading Patterns

### Best Practices for Loading States

1. **Use Skeleton components for initial loads:**
```tsx
if (loading && !data) {
  return <Skeleton className="h-32 w-full" />;
}
```

2. **Maintain layout during updates:**
```tsx
// Good - prevents layout shift
{loading ? (
  <Skeleton className="h-9 w-32" />
) : (
  <p className="text-3xl">{value}</p>
)}

// Bad - causes layout shift
{loading && <Spinner />}
{!loading && <p>{value}</p>}
```

3. **Stagger skeleton animations for multiple items:**
```tsx
{Array.from({ length: 4 }).map((_, i) => (
  <Skeleton 
    key={i} 
    className="h-20 w-full"
    style={{ animationDelay: `${i * 100}ms` }}
  />
))}
```

### Data Refresh Intervals

Standard refresh intervals used across the application:
- **Real-time critical**: 5-10 seconds (auth status, active transfers)
- **Near real-time**: 30 seconds (monthly summaries, analytics)
- **Standard updates**: 60 seconds (user counts, general metrics)
- **Low priority**: 120 seconds (system health, background metrics)

### Preventing Flash During Updates

To prevent flashing during periodic data refreshes:

1. **Keep previous data during fetch:**
```tsx
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);

const refresh = async () => {
  // Don't set loading true if we have data
  if (!data) setLoading(true);
  
  const newData = await fetchData();
  setData(newData);
  setLoading(false);
};
```

2. **Use optimistic updates:**
```tsx
// Update UI immediately, rollback on error
setData(optimisticValue);
try {
  const result = await updateData();
  setData(result);
} catch (error) {
  setData(previousValue); // Rollback
}
```

3. **Implement proper loading boundaries:**
```tsx
<MetricCard
  value={data?.value || previousValue}
  loading={loading && !data} // Only show skeleton on initial load
/>
```

## Component Guidelines

### When to Create Shareable Components

Create a shareable component when:
- Used in 3+ different pages/features
- Has consistent behavior across uses
- Encapsulates complex logic or styling
- Improves code maintainability

### Component Organization

```
/components
  /ui           - Base UI components (buttons, inputs, etc.)
  /shared       - Business-agnostic shared components
  /admin        - Admin-specific components
  /custodian    - Custodian-specific components
  /audit        - Audit/compliance components
```

### Styling Guidelines

1. **Use Tailwind CSS classes**
2. **Avoid dynamic class generation** (Tailwind can't detect them)
3. **Use CSS variables for theme values**
4. **Implement dark mode support by default**

### Testing Shareable Components

All shareable components should have:
- TypeScript interfaces for props
- Default prop values where appropriate
- Error boundaries for fault tolerance
- Loading and error states
- Accessibility attributes (ARIA labels, roles)

## Migration Guide

### Migrating from LoadingState to Skeleton

**Before:**
```tsx
<LoadingState isLoading={loading} variant="spinner">
  <div>{content}</div>
</LoadingState>
```

**After:**
```tsx
{loading ? (
  <Skeleton className="h-8 w-full" />
) : (
  <div>{content}</div>
)}
```

### Benefits of Skeleton Loading
- Better perceived performance
- Prevents layout shift
- Consistent with modern UX patterns
- Reduces visual jarring during updates
- Works better with SSR/SSG

## Performance Considerations

1. **Memoize expensive computations:**
```tsx
const expensiveValue = useMemo(() => 
  calculateComplexMetric(data), [data]
);
```

2. **Debounce rapid updates:**
```tsx
const debouncedValue = useDebounce(value, 500);
```

3. **Use React.memo for pure components:**
```tsx
export const MetricCard = React.memo(MetricCardComponent);
```

4. **Implement virtual scrolling for long lists**
5. **Lazy load heavy components**

## Accessibility

All shareable components must include:
- Proper ARIA labels
- Keyboard navigation support
- Screen reader announcements
- Focus management
- Color contrast compliance (WCAG AA)

## Version History

- v1.0 - Initial component library
- v1.1 - Added MetricCardsCarousel
- v1.2 - Deprecated LoadingState in favor of Skeleton
- v1.3 - Added FilterBadge component
- v1.4 - Improved loading patterns to prevent flashing