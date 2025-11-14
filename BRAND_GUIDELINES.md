# LearnifyTube - Brand Guidelines

## Quick Reference

**App Name**: LearnifyTube
**Purpose**: Educational YouTube content downloader focused on learning and productivity
**Brand Personality**: Modern, clean, educational, trustworthy, tech-savvy

---

## 🎨 Color Palette

### Primary Colors

#### Primary Blue
- **Hex**: `#3B82F6`
- **RGB**: `rgb(59, 130, 246)`
- **HSL**: `hsl(217.2, 91.2%, 59.8%)`
- **Tailwind**: `primary-500`, `brand-blue`
- **Usage**: Primary brand color, main UI elements, buttons, headers, links

#### Accent Green
- **Hex**: `#10B981`
- **RGB**: `rgb(16, 185, 129)`
- **HSL**: `hsl(160, 84%, 39.4%)`
- **Tailwind**: `accent-500`, `brand-green`
- **Usage**: Success states, accents, highlights, CTAs, progress indicators

### Brand Gradient
```css
background: linear-gradient(135deg, #3B82F6 0%, #10B981 100%);
```
**Usage**: Hero sections, featured elements, premium features, main CTAs

### Semantic Colors

#### Success
- **Color**: `#10B981` (Accent Green)
- **Usage**: Success messages, completed downloads, positive actions

#### Warning
- **Color**: `#F59E0B`
- **Usage**: Warnings, caution states, pending actions

#### Error
- **Color**: `#EF4444`
- **Usage**: Errors, destructive actions, failed downloads

#### Info
- **Color**: `#3B82F6` (Primary Blue)
- **Usage**: Information messages, tips, hints

### Gray Scale

| Name    | Hex       | Usage                          |
|---------|-----------|--------------------------------|
| Gray 50 | `#F9FAFB` | Light backgrounds              |
| Gray 100| `#F3F4F6` | Cards, containers              |
| Gray 200| `#E5E7EB` | Borders, dividers              |
| Gray 300| `#D1D5DB` | Disabled states                |
| Gray 400| `#9CA3AF` | Placeholder text               |
| Gray 500| `#6B7280` | Secondary text                 |
| Gray 600| `#4B5563` | Body text                      |
| Gray 700| `#374151` | Headings                       |
| Gray 800| `#1F2937` | Dark mode backgrounds          |
| Gray 900| `#111827` | Dark mode surfaces             |

---

## 🔤 Typography

### Font Stack
```css
font-family: 'Geist', 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Font Sizes
- **Hero/Display**: 48px - 64px (3rem - 4rem)
- **H1**: 36px (2.25rem)
- **H2**: 30px (1.875rem)
- **H3**: 24px (1.5rem)
- **H4**: 20px (1.25rem)
- **Body Large**: 18px (1.125rem)
- **Body**: 16px (1rem)
- **Body Small**: 14px (0.875rem)
- **Caption**: 12px (0.75rem)

### Font Weights
- **Regular (400)**: Body text
- **Medium (500)**: Subheadings, emphasized text
- **Semibold (600)**: Buttons, labels
- **Bold (700)**: Headings, important text

---

## 📏 Spacing System

Based on 4px unit:
- **xs**: `4px` (0.25rem)
- **sm**: `8px` (0.5rem)
- **md**: `16px` (1rem)
- **lg**: `24px` (1.5rem)
- **xl**: `32px` (2rem)
- **2xl**: `48px` (3rem)
- **3xl**: `64px` (4rem)

---

## 🔲 Border Radius

- **Small (4px)**: Tags, badges, small elements
- **Medium (8px)**: Buttons, inputs
- **Large (12px)**: Cards, modals
- **XL (16px)**: Hero sections, large containers
- **Full (9999px)**: Pills, circular elements

---

## 🎯 Component Guidelines

### Buttons

#### Primary Button
```tsx
<button className="bg-gradient-to-br from-primary to-accent text-white px-6 py-3 rounded-md font-semibold shadow-lg hover:shadow-xl transition-all">
  Download
</button>
```

#### Secondary Button
```tsx
<button className="bg-transparent border-2 border-primary text-primary px-6 py-3 rounded-md font-semibold hover:bg-primary/10 transition-all">
  Cancel
</button>
```

#### Success Button
```tsx
<button className="bg-accent text-white px-6 py-3 rounded-md font-semibold hover:bg-accent-600 transition-all">
  Complete
</button>
```

### Cards
```tsx
<div className="bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
  {/* Card content */}
</div>
```

### Inputs
```tsx
<input className="w-full bg-background border-2 border-input rounded-md px-4 py-3 text-foreground focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all" />
```

---

## 🌓 Dark Mode

### Colors
- **Background**: `#111827` (Gray 900)
- **Secondary Background**: `#1F2937` (Gray 800)
- **Elevated Surface**: `#374151` (Gray 700)
- **Text Primary**: `#F9FAFB` (Gray 50)
- **Text Secondary**: `#D1D5DB` (Gray 300)

### Important Notes
- Primary Blue (`#3B82F6`) and Accent Green (`#10B981`) remain the same in dark mode
- Gradients remain the same
- Ensure sufficient contrast ratios (WCAG AA minimum)

---

## 💡 Usage Guidelines

### When to Use Primary Blue
- Primary buttons and CTAs
- Links and interactive elements
- Active states
- Brand elements
- Navigation highlights

### When to Use Accent Green
- Success messages
- Download completed states
- Progress indicators
- Positive actions
- Growth/learning related features

### When to Use the Gradient
- Hero sections
- Premium features
- Main CTAs on landing pages
- Feature highlights
- Brand showcases

---

## 🎨 Logo Usage

### The Video Book Icon
The LearnifyTube logo features an open book with a video play button, symbolizing the fusion of traditional learning with modern digital content.

### Clear Space
Maintain a minimum clear space around the logo equal to 45% of logo height.

### Minimum Size
- **Digital**: 32x32px minimum
- **Print**: 0.5 inch minimum

### Do's ✅
- Use on white or light backgrounds
- Use on dark backgrounds with sufficient contrast
- Maintain aspect ratio
- Use provided color versions

### Don'ts ❌
- Don't stretch or distort
- Don't change colors (except white version for dark backgrounds)
- Don't add effects (drop shadows, glows)
- Don't place on busy backgrounds

---

## 📝 Tailwind Usage

### Using Brand Colors in Components

```tsx
// Primary Blue
<div className="bg-primary text-primary-foreground">Primary</div>

// Accent Green
<div className="bg-accent text-accent-foreground">Success</div>

// With shades
<div className="bg-primary-100 text-primary-900">Light primary</div>
<div className="bg-accent-500 hover:bg-accent-600">Hover state</div>

// Brand gradient
<div className="bg-gradient-to-br from-primary to-accent">Gradient</div>

// Semantic colors
<div className="bg-success">Success</div>
<div className="bg-warning">Warning</div>
<div className="bg-error">Error</div>

// Spacing
<div className="p-md m-lg gap-xl">Branded spacing</div>

// Custom scrollbar
<div className="scrollbar-brand">Branded scrollbar</div>
```

### CSS Variables

All colors are available as CSS variables:

```css
/* Brand Colors */
color: hsl(var(--brand-blue));
color: hsl(var(--brand-green));

/* Semantic Colors */
background: hsl(var(--primary));
background: hsl(var(--accent));
background: hsl(var(--success));
background: hsl(var(--warning));
background: hsl(var(--destructive));

/* UI Colors */
background: hsl(var(--background));
color: hsl(var(--foreground));
border-color: hsl(var(--border));
```

---

## 🗣️ Brand Voice & Tone

**Clear & Concise**: Explain complex features simply
**Friendly & Approachable**: Warm, helpful, not corporate
**Educational**: Emphasize learning and growth
**Professional**: Trustworthy but not stuffy
**Encouraging**: Motivate users to learn and explore

### Example Copy

#### ✅ Good
- "Download videos for offline learning"
- "Your personal learning library"
- "Learn anywhere, anytime"
- "Build your knowledge base"

#### ❌ Avoid
- "Enterprise-grade video acquisition solution"
- "Leverage our platform for content archival"
- "Synergistic learning ecosystem"

---

## 🔍 Accessibility

### Contrast Ratios
- **Normal Text**: Minimum 4.5:1 (WCAG AA)
- **Large Text**: Minimum 3:1 (WCAG AA)
- **UI Components**: Minimum 3:1

### Focus States
Always include visible focus states using the ring utilities:
```tsx
<button className="focus:ring-4 focus:ring-primary/20">Button</button>
```

### Color Blindness
- Never rely on color alone to convey information
- Use icons, labels, and patterns in addition to color
- Test with color blindness simulators

---

## 📦 Assets

### Required Files
- `logo.svg` - Main logo (vector)
- `logo.png` - Logo bitmap (1024x1024 minimum)
- `icon.icns` - macOS app icon
- `icon.ico` - Windows app icon
- Various icon sizes in `/resources/`

### Icon Sizes
- 16x16, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512, 1024x1024

---

## 🚀 Quick Start for Developers

1. **Colors**: Use `primary`, `accent`, `success`, `warning`, `error` from Tailwind config
2. **Spacing**: Use branded spacing: `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`
3. **Typography**: Font stack is automatically applied via `font-sans`
4. **Dark Mode**: Always test in both light and dark modes
5. **Components**: Use shadcn/ui components with custom brand colors
6. **Icons**: Use outline-style icons (Lucide React is included)

---

**Version**: 1.0
**Last Updated**: November 2025
**For questions**: Refer to this document and maintain consistency across all features

