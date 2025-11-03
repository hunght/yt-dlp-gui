# Refactoring Best Practices

## Summary: Our Refactoring Journey

This document captures lessons learned from refactoring the YouTube downloader app, focusing on the TranscriptPanel evolution:

**Phase 1: Component Separation** (TranscriptPanel 797 → 521 lines)
- Broke monolithic component into focused pieces
- Created: TranscriptWord, TranslationTooltip, TranscriptControls, TranscriptContent
- Result: Each component has ONE clear responsibility

**Phase 2: Hook Removal** (Removed useTranscript.ts - 242 lines)
- Moved queries from hook directly into PlayerPage
- Exposed hidden complexity
- Made debugging straightforward

**Phase 3: Component Ownership** (PlayerPage 500 → 274 lines)
- Moved queries from PlayerPage into TranscriptPanel
- TranscriptPanel now owns ALL its data
- Added atoms for shared state (no prop drilling)
- Result: Clean parent, self-contained component

**Key Lesson: Good architecture is about clear ownership and visibility, not clever abstractions.**

---

## Core Principles

### 1. **Don't Hide Complexity, Manage It**

❌ **Bad**: Creating hooks or abstractions to hide complexity
```typescript
// Hook that hides 10+ responsibilities
const transcript = useTranscript(videoId, playback.data);
// What's happening? Have to read 242 lines to find out
```

✅ **Good**: Keep logic visible, extract pure functions
```typescript
// Visible queries in component
const transcriptQuery = useQuery({ ... });
const downloadMutation = useMutation({ ... });

// Pure utility functions
const filteredLangs = filterLanguagesByPreference(langs, prefs);
```

**Why?** You can see at a glance what the component is doing. Debugging is straightforward.

---

### 2. **Single Responsibility Principle**

Each component/function should do ONE thing well.

❌ **Bad**: God component doing everything
```typescript
// TranscriptPanel.tsx - 797 lines
// - Word rendering
// - Tooltip display
// - Controls
// - State management
// - API calls
// - All in one place
```

✅ **Good**: Focused components with clear boundaries
```typescript
// TranscriptWord.tsx - renders a single word
// TranslationTooltip.tsx - shows translation popup
// TranscriptControls.tsx - handles all controls
// TranscriptContent.tsx - displays transcript
// TranscriptPanel.tsx - coordinates everything
```

**Test**: If you can't describe what a component/function does in one short sentence, it's doing too much.

---

### 3. **When to Use Hooks vs. Utilities**

| Use Hook When | Use Utility Function When |
|--------------|---------------------------|
| Sharing stateful logic across components | Pure computation |
| Reusable in multiple places | Data transformation |
| Managing React lifecycle | Business logic |
| Coordinating multiple hooks | Validation/formatting |
| | localStorage operations |

**Good Hooks:**
- `useVideoPlayback()` - Manages video player state, used in multiple places
- `useDebounce()` - Reusable utility hook
- `useWatchProgress()` - Coordinates time tracking

**Bad Hooks (should be inline or utilities):**
- ❌ `useTranscript()` - Just wrapping queries, only used once
- ❌ Hooks that mix 10+ different concerns
- ❌ Hooks that make debugging harder

**The Rule**: If a hook is only used once and just wraps queries/mutations, move them directly into the component.

---

### 4. **Visibility Over Abstraction**

❌ **Bad**: Abstract everything behind layers
```typescript
const data = useSomeHook(videoId);
// What queries are running?
// What's the loading state?
// What mutations exist?
// No idea without reading the hook file
```

✅ **Good**: Make important things visible
```typescript
const transcriptQuery = useQuery({ ... });
const downloadMutation = useMutation({ ... });
// Clear what's happening
// Can see query states directly
// Easy to set breakpoints
```

**The Rule**: If you need to read another file to understand code flow, the abstraction is wrong.

---

### 5. **Extract Pure Functions to Utilities**

❌ **Bad**: Business logic mixed with React code
```typescript
// Inside component
const filtered = languages.filter(l =>
  preferences.includes(l.lang)
);

const cooldown = (() => {
  try {
    const raw = localStorage.getItem(...);
    // 10 more lines
  } catch {}
})();
```

✅ **Good**: Pure functions in utility files
```typescript
// utils/transcriptUtils.ts
export function filterLanguagesByPreference(languages, preferences) {
  if (preferences.length === 0) return languages;
  return languages.filter(l => preferences.includes(l.lang));
}

export function isInCooldown(videoId, lang) {
  // Pure function, easy to test
}

// In component
const filtered = filterLanguagesByPreference(languages, preferences);
const cooldown = isInCooldown(videoId, lang);
```

**Benefits:**
- Easy to test (no React dependencies)
- Reusable across components
- Clear inputs and outputs
- Can be used in Node.js scripts

---

### 6. **Component Composition Over Monoliths**

Break large components into smaller, focused ones.

**Process:**
1. Identify distinct responsibilities
2. Extract each to its own component
3. Keep state management in parent
4. Pass data via props (explicit is better than implicit)

**Example: TranscriptPanel Refactoring**
```typescript
// Before: 797 lines, everything mixed together

// After: Multiple focused components
<TranscriptPanel>
  <TranscriptContent
    segments={segments}
    onWordMouseEnter={handleWordMouseEnter}
    // ... clear props
  />

  {hoverTranslation && (
    <TranslationTooltip
      word={word}
      translation={translation}
      onSave={handleSave}
    />
  )}

  <TranscriptControls
    filteredLanguages={languages}
    onLanguageChange={setLanguage}
    // ... clear props
  />
</TranscriptPanel>
```

**Benefits:**
- Each component has clear responsibility
- Easy to test in isolation
- Can reuse components elsewhere
- Easier to understand at a glance

---

### 7. **Explicit Dependencies Over Hidden Ones**

❌ **Bad**: Hidden dependencies
```typescript
// Hook internally calls multiple queries
// and has complex side effects
const transcript = useTranscript(videoId);

// What queries is this triggering?
// What side effects are happening?
// Unknown without reading implementation
```

✅ **Good**: Explicit dependencies
```typescript
const transcriptQuery = useQuery({
  queryKey: ["transcript", videoId, lang],
  queryFn: () => trpcClient.ytdlp.getTranscript.query({ videoId, lang }),
  enabled: !!videoId,
});

// Clear what this depends on
// Easy to see in React DevTools
// Can track query state directly
```

---

### 8. **Co-locate Related Logic**

Keep related things together.

❌ **Bad**: Spread across multiple files
```typescript
// Hook file has half the logic
// Component has the other half
// Hard to see the full picture
```

✅ **Good**: Related logic in one place
```typescript
// In TranscriptPanel.tsx (owns all its data)
const transcriptQuery = useQuery({ ... });
const downloadMutation = useMutation({ ... });

useEffect(() => {
  // Auto-download logic
  // Right here, visible
}, [dependencies]);
```

**Exception**: Extract to separate file when:
- Logic is reused in multiple places
- Pure utility functions (no React dependencies)
- The file becomes too large (>500 lines)

---

### 9. **Components Should Own Their Data**

Components should manage their own queries and state. Parent components should only pass minimal props.

❌ **Bad**: Parent manages child's data
```typescript
// PlayerPage owns all transcript queries
const transcriptQuery = useQuery({ ... });
const transcriptSegmentsQuery = useQuery({ ... });
const downloadMutation = useMutation({ ... });
// ... 200+ lines of transcript logic

<TranscriptPanel
  transcriptQuery={transcriptQuery}
  transcriptSegmentsQuery={transcriptSegmentsQuery}
  downloadMutation={downloadMutation}
  // ... 10+ props
/>
```

**Problems:**
- PlayerPage is bloated with transcript logic
- Hard to move TranscriptPanel to other pages
- Unclear who owns what
- Parent needs to know implementation details

✅ **Good**: Component owns its data
```typescript
// PlayerPage - minimal, clean
<TranscriptPanel
  videoId={videoId}
  currentTime={currentTime}
  videoRef={videoRef}
  playbackData={playback.data}
  onSelect={handleSelect}
  onEnterKey={handleEnterKey}
/>

// TranscriptPanel - owns all its queries
export function TranscriptPanel({ videoId, currentTime, ... }) {
  // All queries live HERE
  const transcriptQuery = useQuery({ ... });
  const transcriptSegmentsQuery = useQuery({ ... });
  const downloadMutation = useMutation({ ... });

  // ... rest of logic
}
```

**Benefits:**
- Parent is simple and focused
- Component is self-contained and portable
- Clear ownership boundaries
- Easy to move to other pages

---

### 10. **Use Atoms for Shared State (Not Prop Drilling)**

When multiple components need the same state, use atoms instead of prop drilling.

❌ **Bad**: Prop drilling through multiple layers
```typescript
// PlayerPage
const [transcriptLang, setTranscriptLang] = useState();

<TranscriptPanel
  onLanguageChange={setTranscriptLang}
/>

<AnnotationForm
  language={transcriptLang}  // Needs this from TranscriptPanel
/>
```

**Problems:**
- Parent needs to know about TranscriptPanel's internal state
- Tight coupling between unrelated components
- Props flow through unnecessary layers

✅ **Good**: Shared atom
```typescript
// context/transcriptSettings.ts
export const currentTranscriptLangAtom = atom<string | undefined>(undefined);

// TranscriptPanel - sets the value
const [, setCurrentTranscriptLang] = useAtom(currentTranscriptLangAtom);

useEffect(() => {
  setCurrentTranscriptLang(effectiveLang);
}, [effectiveLang, setCurrentTranscriptLang]);

// AnnotationForm - reads the value
const [currentTranscriptLang] = useAtom(currentTranscriptLangAtom);

<AnnotationForm language={currentTranscriptLang} />
```

**Benefits:**
- No prop drilling
- Components are loosely coupled
- Parent doesn't need to know about internal state
- Easy to add more consumers

**When to use atoms:**
- Shared settings (theme, language, preferences)
- Cross-component state (current transcript language)
- Global UI state (modals, sidebars)

**When NOT to use atoms:**
- Component-local state
- Props that define component behavior
- Data that flows naturally down the tree

---

## Refactoring Process

### Step 1: Identify Smells
- Component >500 lines
- Hook only used once
- Hard to debug (need to read multiple files)
- Can't easily test a piece of logic
- Mixing UI, state, and business logic
- Parent manages child's queries/state
- Prop drilling across multiple layers

### Step 2: Separate Concerns
- UI components (presentation)
- State management (owned by component, not parent)
- Business logic (pure utilities)
- Data fetching (queries/mutations in component that needs them)
- Shared state (atoms for cross-component needs)

### Step 3: Extract Components
- Find distinct UI responsibilities
- Create focused components
- Pass minimal props (behavior, not data)
- Let components own their own queries

### Step 4: Extract Pure Functions
- Find business logic
- Move to utility files
- Make them pure (no side effects)
- Easy to test

### Step 5: Inline Single-Use Hooks
- If hook is only used once
- Move queries/mutations to component
- Keep them visible
- Extract pure logic to utilities

### Step 6: Establish Component Ownership
- Move queries from parent to child component
- Child owns its data, parent passes minimal props
- Use atoms for shared state (avoid prop drilling)
- Parent becomes simple coordinator

### Step 7: Move Related UI Together
- If component owns queries, it should own related dialogs/modals
- Example: TranscriptPanel owns TranscriptSettingsDialog
- Keeps related functionality together

---

## Quick Checklist

Before creating a hook, ask:
- [ ] Is this used in multiple places?
- [ ] Does it share stateful logic?
- [ ] Does it make debugging easier?
- [ ] Can I describe it in one sentence?

If mostly "no", don't create a hook. Use inline queries + utility functions instead.

Before creating an abstraction, ask:
- [ ] Does this hide complexity or manage it?
- [ ] Will future developers understand the code flow?
- [ ] Can I debug without reading multiple files?
- [ ] Is the abstraction necessary or just convenient?

If it hides complexity without adding value, don't abstract it.

---

## Real Examples from This Codebase

### ✅ Good Hook: `useVideoPlayback`
```typescript
export function useVideoPlayback(videoId: string | undefined) {
  // Shares video playback state across components
  // Reusable
  // Single responsibility: manage video data
}
```

### ❌ Bad Hook: `useTranscript` (now removed)
```typescript
// Was 242 lines mixing:
// - 4 queries
// - 2 mutations
// - State management
// - Side effects
// - localStorage
// - Toast notifications
// Only used once
// Hard to debug
```

### ✅ Good Utility: `transcriptUtils.ts`
```typescript
// Pure functions
// No React dependencies
// Easy to test
// Reusable
export function filterLanguagesByPreference(languages, preferences) { ... }
export function isInCooldown(videoId, lang) { ... }
```

### ✅ Good Component Separation: `TranscriptPanel`
- `TranscriptWord` - renders a word
- `TranslationTooltip` - shows tooltip
- `TranscriptControls` - handles controls
- `TranscriptContent` - displays text
- `TranscriptPanel` - coordinates all of above

Each has ONE clear responsibility.

### ✅ Good Component Ownership: `PlayerPage` → `TranscriptPanel`

**Before (Bad):**
```typescript
// PlayerPage.tsx - 500 lines, bloated with transcript logic
const transcriptQuery = useQuery({ ... });
const transcriptSegmentsQuery = useQuery({ ... });
const downloadMutation = useMutation({ ... });
const [selectedLang, setSelectedLang] = useState();
// ... 200+ lines of transcript queries, mutations, effects

<TranscriptPanel
  transcriptQuery={transcriptQuery}
  transcriptSegmentsQuery={transcriptSegmentsQuery}
  downloadMutation={downloadMutation}
  selectedLang={selectedLang}
  setSelectedLang={setSelectedLang}
  // ... 10+ more props
/>

<TranscriptSettingsDialog
  selectedLang={selectedLang}
  onLanguageChange={setSelectedLang}
  // Parent has to manage TranscriptPanel's state
/>
```

**After (Good):**
```typescript
// PlayerPage.tsx - 274 lines, clean and focused
const [currentTranscriptLang] = useAtom(currentTranscriptLangAtom);

<TranscriptPanel
  videoId={videoId}
  currentTime={currentTime}
  videoRef={videoRef}
  playbackData={playback.data}
  onSelect={handleSelect}
  onEnterKey={handleEnterKey}
  // Only 6 minimal props!
/>

// TranscriptPanel.tsx - owns ALL its data
export function TranscriptPanel({ videoId, currentTime, ... }) {
  const [, setCurrentTranscriptLang] = useAtom(currentTranscriptLangAtom);

  // All queries owned HERE
  const transcriptQuery = useQuery({ ... });
  const transcriptSegmentsQuery = useQuery({ ... });
  const downloadMutation = useMutation({ ... });

  // Internal state
  const [selectedLang, setSelectedLang] = useState();

  // Update shared atom for other components
  useEffect(() => {
    setCurrentTranscriptLang(effectiveLang);
  }, [effectiveLang]);

  return (
    <>
      <TranscriptContent ... />
      <TranscriptControls ... />
      {/* TranscriptSettingsDialog also owned HERE */}
      <TranscriptSettingsDialog ... />
    </>
  );
}
```

**Results:**
- PlayerPage: **500 → 274 lines** (45% reduction)
- TranscriptPanel: Self-contained, portable, owns all its data
- Shared state via atom (no prop drilling)
- Clear ownership boundaries

### ✅ Good Use of Atoms: `currentTranscriptLangAtom`

```typescript
// context/transcriptSettings.ts
export const currentTranscriptLangAtom = atom<string | undefined>(undefined);

// TranscriptPanel sets it
const [, setCurrentTranscriptLang] = useAtom(currentTranscriptLangAtom);

// AnnotationForm reads it
const [currentTranscriptLang] = useAtom(currentTranscriptLangAtom);
```

**Why this is good:**
- No prop drilling through PlayerPage
- Components are loosely coupled
- Easy to add more consumers (e.g., another component needs current language)
- PlayerPage doesn't need to know about this state

---

## Remember

**The goal of refactoring is to make code easier to understand and maintain, not to create clever abstractions.**

### Core Values
- **Clarity > Cleverness**
- **Visible > Hidden**
- **Simple > Complex**
- **Explicit > Implicit**
- **Ownership > Sharing**

### Key Guidelines

1. **Components own their data** - Don't make parents manage child queries/state
2. **Use atoms for shared state** - Avoid prop drilling across unrelated components
3. **Keep queries visible** - Don't hide them in single-use hooks
4. **Extract pure functions** - Business logic goes in utilities, not components
5. **Break down monoliths** - >500 lines = time to split

### Decision Tree

**Should I create a hook?**
- Is it used in 2+ places? → Maybe
- Does it make debugging harder? → No
- Only wraps queries? → No, inline them

**Should I use an atom?**
- Shared across unrelated components? → Yes
- Would require prop drilling? → Yes
- Component-local state? → No
- Natural parent→child flow? → No

**Should I extract a component?**
- Distinct UI responsibility? → Yes
- Reusable elsewhere? → Yes
- >500 lines in parent? → Yes
- Just to hide code? → No

When in doubt, **keep it visible in the component**. You can always abstract later if you find yourself repeating the same pattern in multiple places.

**Most important: Can you understand the code flow without reading multiple files? If not, simplify.**

