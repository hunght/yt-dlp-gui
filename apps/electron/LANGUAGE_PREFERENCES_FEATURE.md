# Language Preferences Feature

## Overview
Implemented a comprehensive language preference system that allows users to filter transcript language options based on their preferred languages, with automatic system language detection.

## Features

### 1. System Language Detection
- Automatically detects user's system language from Electron's `app.getLocale()`
- Extracts primary language code (e.g., "en-US" → "en")
- Auto-initializes preferences with system language on first launch

### 2. User Preferences Storage
- New `user_preferences` table in database with:
  - `id` (text, primary key, default: 'default')
  - `preferred_languages` (JSON array of language codes)
  - `system_language` (detected system language)
  - `created_at`, `updated_at` (timestamps)

### 3. Settings UI
Located in: `/settings` page

Features:
- **System Language Display**: Shows detected system language (read-only)
- **Preferred Languages List**: Visual badge display of configured languages with remove buttons
- **Manual Add**: Text input to add custom language codes
- **Quick Add**: Pre-populated buttons for 30+ common languages
- **Visual Feedback**: Toast notifications for success/error states

### 4. Player Language Filtering
Located in: `/player` page

Behavior:
- Language selector only shows languages in user's preferred list
- If no preferences configured, shows all available languages
- Auto-hides selector if no matching languages available
- Updates immediately when preferences change

## Implementation Details

### Database Schema
```typescript
export const userPreferences = sqliteTable("user_preferences", {
  id: text("id").primaryKey().notNull().default("default"),
  preferredLanguages: text("preferred_languages").notNull().default("[]"),
  systemLanguage: text("system_language"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at"),
});
```

### Migration
File: `packages/database/drizzle/0006_user_preferences.sql`
- Creates table with default constraints
- Inserts default row with empty language array
- Will be applied automatically on next app launch

### API Endpoints (tRPC)
Router: `preferences`

#### `getUserPreferences`
- Type: Query
- Returns: `{ id, preferredLanguages: string[], systemLanguage, createdAt, updatedAt }`
- Auto-initializes with system language on first access

#### `updatePreferredLanguages`
- Type: Mutation
- Input: `{ languages: string[] }`
- Updates preferred languages array in database
- Validates at least one language required

#### `getSystemLanguage`
- Type: Query
- Returns: `{ systemLanguage: string }`
- Utility endpoint for system language detection

### Components

#### LanguagePreferencesSection
Location: `src/pages/settings-page/components/LanguagePreferencesSection.tsx`

Features:
- System language display badge
- Preferred languages management (add/remove)
- Quick-add buttons for 30+ common languages
- Real-time updates with optimistic UI
- Toast notifications for user feedback
- Form validation (prevents duplicates, requires at least one language)

#### PlayerPage Integration
Location: `src/pages/player/PlayerPage.tsx`

Changes:
- Added `userPrefsQuery` to fetch preferences
- Added `filteredLanguages` memo to filter available subtitles
- Language selector now uses filtered list
- Conditional rendering (hides if no matching languages)

## Usage Flow

### Initial Setup (Automatic)
1. User opens app for first time
2. `getUserPreferences` called → auto-initializes with system language
3. System language (e.g., "en") added to preferred languages
4. Player language selector shows only system language initially

### User Configuration
1. User navigates to Settings page
2. Sees detected system language
3. Can add languages via:
   - Text input (manual entry)
   - Quick-add buttons (common languages)
4. Can remove languages (except must keep at least one)
5. Changes saved immediately to database

### Player Experience
1. User opens video in player
2. Available subtitles queried from yt-dlp metadata
3. Filtered to show only preferred languages
4. Dropdown displays 2-3 options instead of 20+
5. User selects language → transcript loads in selected language

## Benefits

### User Experience
- **Reduced Clutter**: Language selector shows only relevant options (2-3 vs 20+)
- **Smart Defaults**: System language automatically configured
- **Easy Management**: Visual settings UI with quick-add options
- **Immediate Feedback**: Changes reflected instantly in player

### Technical Benefits
- **Functional Programming**: Pure functions, no classes
- **Type Safety**: Full TypeScript types with tRPC
- **Database Integrity**: Foreign key constraints, validation
- **Reactive UI**: React Query for automatic cache invalidation
- **Scalability**: JSON array allows unlimited language preferences

## Testing

### Manual Testing Checklist
- [ ] First launch: System language detected and stored
- [ ] Settings: Add language via text input
- [ ] Settings: Add language via quick-add button
- [ ] Settings: Remove language (keeps at least one)
- [ ] Settings: Try adding duplicate (shows error toast)
- [ ] Player: Language selector shows only preferred languages
- [ ] Player: Selector hides if no matching languages
- [ ] Player: Switch language → correct transcript loads
- [ ] Database: Preferences persist across app restarts

### Edge Cases Handled
- **Empty Preferences**: Shows all available languages (fallback)
- **No Matching Languages**: Hides selector entirely
- **System Language Detection Fails**: Defaults to "en"
- **Last Language Removal**: Prevents removal with error message
- **Duplicate Addition**: Shows toast notification, no DB update

## File Changes

### New Files
- `packages/database/drizzle/0006_user_preferences.sql`
- `apps/electron/src/api/routers/preferences/index.ts`
- `apps/electron/src/pages/settings-page/components/LanguagePreferencesSection.tsx`

### Modified Files
- `packages/database/src/schema.ts` (added userPreferences table)
- `apps/electron/src/api/index.ts` (added preferences router)
- `apps/electron/src/pages/settings-page/SettingsPage.tsx` (integrated language section)
- `apps/electron/src/pages/player/PlayerPage.tsx` (added filtering logic)
- `apps/electron/src/components/version-checker/version-checker.tsx` (fixed type errors)

## Future Enhancements

### Potential Features
1. **Language Auto-Detection**: Detect video's default language, auto-add to preferences
2. **Language Aliases**: Support regional variants (e.g., "en-US", "en-GB" both map to "en")
3. **Import/Export**: Share language preferences across devices
4. **Language Frequency**: Sort by most-used languages
5. **Bulk Operations**: Add multiple languages at once
6. **Language Names**: Display full names instead of codes in player
7. **Preference Profiles**: Different language sets for different contexts

### Technical Improvements
1. **Migration Testing**: Automated tests for schema migration
2. **Performance**: Index on preferred_languages for faster queries
3. **Validation**: Stricter language code validation (ISO 639-1 codes)
4. **Analytics**: Track which languages users prefer
5. **Offline Support**: Cache language preferences locally

## References

- **Database Schema**: `packages/database/src/schema.ts`
- **Migration File**: `packages/database/drizzle/0006_user_preferences.sql`
- **API Router**: `apps/electron/src/api/routers/preferences/index.ts`
- **Settings UI**: `apps/electron/src/pages/settings-page/components/LanguagePreferencesSection.tsx`
- **Player Integration**: `apps/electron/src/pages/player/PlayerPage.tsx` (lines 48-70, 403-417)

## Related Documentation

- [Transcript System](./docs/transcript-system.md)
- [Language Selection](./docs/language-selection.md)
- [User Preferences](./docs/user-preferences.md)
