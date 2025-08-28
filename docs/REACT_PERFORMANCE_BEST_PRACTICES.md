# React Performance Best Practices

## 🚫 Common Anti-Patterns to Avoid

### 1. **Don't Wrap Everything in `useCallback`/`useMemo`**

**❌ WRONG - Over-optimization:**

```tsx
const MyComponent = () => {
  const [count, setCount] = useState(0);

  // Unnecessary - this function is simple and fast
  const increment = useCallback(() => {
    setCount((c) => c + 1);
  }, []);

  // Unnecessary - this value is primitive and fast to compute
  const doubleCount = useMemo(() => count * 2, [count]);

  return <button onClick={increment}>{doubleCount}</button>;
};
```

**✅ CORRECT - Simple and clean:**

```tsx
const MyComponent = () => {
  const [count, setCount] = useState(0);

  const increment = () => setCount((c) => c + 1);
  const doubleCount = count * 2;

  return <button onClick={increment}>{doubleCount}</button>;
};
```

### 2. **Don't Memoize Primitive Values**

**❌ WRONG:**

```tsx
const expensiveValue = useMemo(() => 42, []); // 42 is already primitive!
const formattedDate = useMemo(() => new Date().toLocaleDateString(), []); // Date formatting is fast
```

**✅ CORRECT:**

```tsx
const expensiveValue = 42;
const formattedDate = new Date().toLocaleDateString();
```

## ✅ When to Use `useCallback`

### 1. **Functions Passed as Props to Child Components**

```tsx
const ParentComponent = () => {
  const [items, setItems] = useState([]);

  // ✅ GOOD - This function is passed to a child component
  const handleItemAdd = useCallback((item) => {
    setItems((prev) => [...prev, item]);
  }, []);

  return <ChildComponent onItemAdd={handleItemAdd} />;
};
```

### 2. **Functions Used in `useEffect` Dependencies**

```tsx
const MyComponent = () => {
  const [data, setData] = useState(null);

  // ✅ GOOD - This function is used in useEffect dependency
  const fetchData = useCallback(async () => {
    const result = await api.getData();
    setData(result);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]); // Without useCallback, this would cause infinite loops

  return <div>{/* ... */}</div>;
};
```

### 3. **Event Handlers for Expensive Child Components**

```tsx
const ParentComponent = () => {
  const [selectedId, setSelectedId] = useState(null);

  // ✅ GOOD - This prevents expensive child from re-rendering
  const handleSelect = useCallback((id) => {
    setSelectedId(id);
  }, []);

  return (
    <div>
      <ExpensiveChildComponent onSelect={handleSelect} />
    </div>
  );
};
```

## ✅ When to Use `useMemo`

### 1. **Expensive Calculations**

```tsx
const MyComponent = ({ items }) => {
  // ✅ GOOD - This calculation is expensive
  const expensiveStats = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        // Complex calculations that take time
        return {
          total: acc.total + item.value,
          average: (acc.total + item.value) / (acc.count + 1),
          count: acc.count + 1,
        };
      },
      { total: 0, average: 0, count: 0 }
    );
  }, [items]);

  return <div>{/* ... */}</div>;
};
```

### 2. **Object/Array Creation in Render**

```tsx
const MyComponent = ({ items, filter }) => {
  // ✅ GOOD - This prevents new object creation on every render
  const filteredItems = useMemo(() => {
    return items.filter((item) => item.type === filter);
  }, [items, filter]);

  // ✅ GOOD - This prevents new array creation on every render
  const itemIds = useMemo(() => {
    return items.map((item) => item.id);
  }, [items]);

  return <div>{/* ... */}</div>;
};
```

### 3. **Expensive API Response Processing**

```tsx
const MyComponent = ({ rawData }) => {
  // ✅ GOOD - Processing large API responses
  const processedData = useMemo(() => {
    return rawData.map((item) => ({
      ...item,
      formattedDate: new Date(item.timestamp).toLocaleDateString(),
      calculatedValue: complexCalculation(item.value),
      // ... more expensive operations
    }));
  }, [rawData]);

  return <div>{/* ... */}</div>;
};
```

## 🚫 When NOT to Use `useCallback`/`useMemo`

### 1. **Simple Functions**

```tsx
// ❌ Don't do this
const handleClick = useCallback(() => {
  console.log("clicked");
}, []);

// ✅ Do this instead
const handleClick = () => {
  console.log("clicked");
};
```

### 2. **Primitive Values**

```tsx
// ❌ Don't do this
const count = useMemo(() => 5, []);

// ✅ Do this instead
const count = 5;
```

### 3. **Fast Calculations**

```tsx
// ❌ Don't do this
const doubleValue = useMemo(() => value * 2, [value]);

// ✅ Do this instead
const doubleValue = value * 2;
```

### 4. **Inline Objects/Arrays (unless passed to expensive children)**

```tsx
// ❌ Don't do this (unless passing to expensive child)
const style = useMemo(() => ({ color: "red" }), []);

// ✅ Do this instead
const style = { color: "red" };
```

## 🔧 Performance Optimization Strategies

### 1. **Use React DevTools Profiler**

- Profile your app to identify actual performance bottlenecks
- Don't optimize what you haven't measured

### 2. **Lazy Loading and Code Splitting**

```tsx
// ✅ GOOD - Lazy load expensive components
const ExpensiveComponent = lazy(() => import("./ExpensiveComponent"));

const App = () => (
  <Suspense fallback={<div>Loading...</div>}>
    <ExpensiveComponent />
  </Suspense>
);
```

### 3. **Virtual Scrolling for Large Lists**

```tsx
// ✅ GOOD - Use virtual scrolling for large datasets
import { FixedSizeList as List } from "react-window";

const VirtualizedList = ({ items }) => (
  <List height={400} itemCount={items.length} itemSize={35} itemData={items}>
    {({ index, style, data }) => <div style={style}>{data[index].name}</div>}
  </List>
);
```

### 4. **Proper Key Props**

```tsx
// ✅ GOOD - Use stable, unique keys
{
  items.map((item) => <ListItem key={item.id} item={item} />);
}

// ❌ WRONG - Don't use index as key
{
  items.map((item, index) => <ListItem key={index} item={item} />);
}
```

## 📊 Performance Measurement

### 1. **React DevTools Profiler**

```tsx
import { Profiler } from "react";

const onRenderCallback = (id, phase, actualDuration) => {
  console.log(`Component ${id} took ${actualDuration}ms to render`);
};

const App = () => (
  <Profiler id="App" onRender={onRenderCallback}>
    <MyComponent />
  </Profiler>
);
```

### 2. **Performance API**

```tsx
const measureRender = (componentName) => {
  const start = performance.now();

  return () => {
    const end = performance.now();
    console.log(`${componentName} render took ${end - start}ms`);
  };
};
```

## 🎯 Summary of Best Practices

1. **Measure First**: Use React DevTools Profiler to identify actual bottlenecks
2. **Optimize Reactively**: Only add `useCallback`/`useMemo` when you see performance issues
3. **Keep It Simple**: Don't optimize simple functions or primitive values
4. **Focus on Expensive Operations**: Use `useMemo` for heavy calculations, `useCallback` for prop functions
5. **Consider Child Components**: Use `useCallback` when passing functions to expensive child components
6. **Avoid Premature Optimization**: Write clean, readable code first, optimize when needed

## 🔍 When to Reconsider

- **Large Lists**: Consider virtualization instead of memoization
- **Frequent Re-renders**: Look at parent component state management
- **Heavy Calculations**: Consider moving logic to backend or web workers
- **Memory Usage**: Monitor memory leaks from over-memoization

Remember: **Performance optimization should be data-driven, not guesswork!**
