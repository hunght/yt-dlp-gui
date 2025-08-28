# Render Loop Testing Guide

## 🚨 What Are Render Loops?

Render loops occur when a React component continuously re-renders itself, often due to:

- State updates in `useEffect` without proper dependencies
- Props changing on every render
- Event handlers creating new functions on every render
- Missing dependency arrays in hooks

## 🧪 How to Test for Render Loops

### 1. **Run the Render Loop Tests**

```bash
# Run all render loop tests
npm test -- --grep "Render Loop Prevention"

# Run specific test file
npm test src/tests/YouTubeVideosPage.renderLoop.test.tsx

# Run with verbose output to see render counts
npm test -- --verbose src/tests/YouTubeVideosPage.renderLoop.test.tsx
```

### 2. **What the Tests Check**

The render loop tests verify that your component:

- ✅ **Doesn't render excessively** during initial load
- ✅ **Stays stable** during rapid user interactions
- ✅ **Handles state changes** without loops
- ✅ **Manages form submissions** properly
- ✅ **Deals with API errors** gracefully
- ✅ **Unmounts cleanly** without issues

## 🔧 Using the Render Loop Detector

### Basic Usage

```tsx
import { renderWithLoopDetection } from "./utils/renderLoopDetector";

it("should not cause render loops", async () => {
  let excessiveRendersDetected = false;

  renderWithLoopDetection(<YourComponent />, {
    maxRenders: 30,
    onExcessiveRenders: () => {
      excessiveRendersDetected = true;
    },
  });

  // Perform interactions...

  expect(excessiveRendersDetected).toBe(false);
});
```

### Advanced Usage with Custom Thresholds

```tsx
renderWithLoopDetection(<YourComponent />, {
  maxRenders: 50, // Allow more renders for complex components
  onExcessiveRenders: (count) => {
    console.error(`Component rendered ${count} times!`);
  },
});
```

## 📊 Monitoring Render Performance

### Using the Performance Monitor

```tsx
import { createPerformanceMonitor } from "./utils/renderLoopDetector";

const monitor = createPerformanceMonitor("MyComponent");

// In your component
useEffect(() => {
  monitor.recordRender();
}, []);

// After testing
monitor.logStats();
```

### Example Output

```
📊 Performance Stats for MyComponent: {
  componentName: "MyComponent",
  totalRenders: 15,
  avgRenderTime: 2.3,
  maxRenderTime: 8,
  minRenderTime: 1,
  totalTime: 1500
}
```

## 🚀 Creating Your Own Render Loop Tests

### 1. **Test Component Initialization**

```tsx
it("should not cause render loops during initial load", async () => {
  let excessiveRendersDetected = false;

  renderWithLoopDetection(<YourComponent />, {
    maxRenders: 20,
    onExcessiveRenders: () => {
      excessiveRendersDetected = true;
    },
  });

  // Wait for component to load
  await waitFor(() => {
    expect(screen.getByText("Your Component")).toBeInTheDocument();
  });

  // Wait for potential loops
  await new Promise((resolve) => setTimeout(resolve, 200));

  expect(excessiveRendersDetected).toBe(false);
});
```

### 2. **Test User Interactions**

```tsx
it("should not cause render loops during user interactions", async () => {
  let excessiveRendersDetected = false;

  renderWithLoopDetection(<YourComponent />, {
    maxRenders: 30,
    onExcessiveRenders: () => {
      excessiveRendersDetected = true;
    },
  });

  await waitFor(() => {
    expect(screen.getByText("Your Component")).toBeInTheDocument();
  });

  const input = screen.getByRole("textbox");

  // Rapid typing simulation
  for (let i = 0; i < 20; i++) {
    fireEvent.change(input, { target: { value: `test${i}` } });
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  await new Promise((resolve) => setTimeout(resolve, 200));

  expect(excessiveRendersDetected).toBe(false);
});
```

### 3. **Test State Changes**

```tsx
it("should not cause render loops when state changes", async () => {
  let excessiveRendersDetected = false;

  const { rerender } = renderWithLoopDetection(<YourComponent />, {
    maxRenders: 30,
    onExcessiveRenders: () => {
      excessiveRendersDetected = true;
    },
  });

  // Force multiple re-renders
  for (let i = 0; i < 10; i++) {
    rerender(<YourComponent key={i} />);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  expect(excessiveRendersDetected).toBe(false);
});
```

## 🎯 Common Render Loop Scenarios to Test

### 1. **Form Inputs**

- Rapid typing in text fields
- Multiple form submissions
- Form validation errors

### 2. **Dropdowns and Selects**

- Opening/closing dropdowns
- Changing selections
- Multiple rapid changes

### 3. **Buttons and Toggles**

- Rapid clicking
- State toggles
- Loading states

### 4. **API Calls**

- Loading states
- Error handling
- Retry mechanisms

### 5. **Navigation**

- Route changes
- Component mounting/unmounting
- Tab switching

## 🔍 Debugging Render Loops

### 1. **Check Console Output**

The render loop detector logs:

- Render count and timing
- Warnings for rapid renders
- Errors for excessive renders

### 2. **Use React DevTools Profiler**

- Profile your component during testing
- Look for components that render too frequently
- Check for unnecessary re-renders

### 3. **Common Causes**

```tsx
// ❌ WRONG - Missing dependency array
useEffect(() => {
  setData(fetchData());
}); // Missing []

// ✅ CORRECT - Proper dependency array
useEffect(() => {
  setData(fetchData());
}, []); // Empty array for mount-only

// ❌ WRONG - Function created on every render
const handleClick = () => setCount(count + 1);

// ✅ CORRECT - Stable function reference
const handleClick = useCallback(() => {
  setCount((prev) => prev + 1);
}, []);
```

## 📋 Test Checklist

Before committing code, ensure:

- [ ] **Render loop tests pass** for new components
- [ ] **Performance is acceptable** (under 50 renders for normal interactions)
- [ ] **No console warnings** about rapid renders
- [ ] **Component unmounts cleanly** without errors
- [ ] **State updates are stable** during user interactions

## 🚨 When Tests Fail

### 1. **Excessive Renders Detected**

- Check `useEffect` dependency arrays
- Look for state updates in render functions
- Verify event handlers aren't recreated unnecessarily

### 2. **Rapid Renders Warning**

- Check for missing `useCallback` on prop functions
- Verify state updates aren't chained
- Look for missing dependencies in hooks

### 3. **Component Unstable**

- Check for missing error boundaries
- Verify async operations are handled properly
- Look for memory leaks in event listeners

## 🔧 Integration with CI/CD

### GitHub Actions Example

```yaml
- name: Run Render Loop Tests
  run: |
    npm test -- --grep "Render Loop Prevention" --reporter=verbose
    npm test -- --grep "should not cause render loops" --reporter=verbose
```

### Pre-commit Hook

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm test -- --grep 'Render Loop Prevention'"
    }
  }
}
```

## 📚 Best Practices

1. **Test Early**: Write render loop tests when creating components
2. **Test Often**: Run tests during development, not just before commits
3. **Monitor Performance**: Use the performance monitor for complex components
4. **Fix Issues**: Don't ignore render loop warnings
5. **Document Patterns**: Share solutions with your team

## 🎉 Success Metrics

Your component is stable when:

- ✅ Render loop tests pass consistently
- ✅ Performance monitor shows <50 renders for normal use
- ✅ No console warnings about rapid renders
- ✅ Component responds smoothly to user interactions
- ✅ Memory usage remains stable

Remember: **Preventing render loops is better than fixing them later!**
