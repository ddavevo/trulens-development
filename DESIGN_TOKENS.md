# Design Tokens Reference

## Typography Scale
Based on Figma design analysis, here are the standardized font sizes:

- **10px** - Labels (regular and underline)
- **12px** - Body regular, tabs, buttons, section titles
- **14px** - Subheading (bold)
- **16px** - Body large (source card quotes)

## Official Text Styles (from Figma)
**Mapped to CSS variables:**

- **Body 16px Large** - `--text-style-body-large` (16px, normal, Inter) - Used for source card quotes
- **Body 12px Regular** - `--text-style-body-regular` (12px, normal, Inter) - Used for body text, tabs, buttons
- **Label 10px Regular** - `--text-style-label-regular` (10px, normal, Inter) - Used for labels, badges, publisher names
- **Label 10px Underline** - `--text-style-label-underline` (10px, normal, Inter, underline) - Used for underlined labels
- **Subheading 14px Bold** - `--text-style-subheading` (14px, bold, Inter) - Used for subheadings

## Tab Structure
- **Three tabs**: References | Summary | How to Use
- **Tab styling**: 
  - Padding: 8px top/bottom, 12px left/right
  - Gap: 0
  - Height: 31px (Hug)

## Spacing Scale
Standardized spacing values from auto-layout:

- **2px** - Minimal gap (e.g., badge internal spacing)
- **4px** - Tight spacing (e.g., section header gaps, filter button padding)
- **6px** - Small spacing (e.g., icon to text gaps)
- **8px** - Standard small spacing (e.g., header rows, filter sections)
- **12px** - Standard padding (e.g., card padding, item padding)
- **14px** - Section gaps (e.g., talking points section)
- **16px** - Standard spacing (e.g., card gaps, content padding)
- **20px** - Medium spacing (e.g., footer spacing)
- **32px** - Large spacing (e.g., main content sections)

## Component Dimensions
- Panel width: **359px**
- Content width: **327px**
- Inner content width: **303px**
- Card height: **180px**
- Tab height: **31px**
- Filter section height: **39px**

## Recommendations for Figma

### 1. Use Text Styles
- Create text styles in Figma for each font size/weight combination
- Name them clearly: "Body 12px Regular", "Label 10px Regular", "Quote 16px Bold"
- This makes it easier to identify typography in code

### 2. Use Auto Layout Consistently
- ✅ You've done this - great!
- Use consistent padding modes (e.g., always "Fixed" or always "Hug contents")
- Document gap values in layer names if they're non-standard

### 3. Name Layers with Values
- Instead of "Frame 10", use "Header Row (gap: 8px)"
- Instead of "Text", use "Title (12px, #797979)"
- This helps identify exact values when translating

### 4. Use Component Variants
- Create components for reusable elements (Source Card, Badge, etc.)
- Use variants for states (active/inactive tabs, different reliability badges)
- Makes it clear what's a component vs. instance

### 5. Document Special Cases
- Add notes in Figma for:
  - Dynamic content (e.g., "Text truncates after 3 lines")
  - Responsive behavior (e.g., "Stacks on mobile")
  - Interactive states (e.g., "Hover: background #f5f5f5")

### 6. Color Variables
- ✅ You've done this with CSS variables
- Keep using Figma variables that match CSS variable names
- Document hex values in variable descriptions

### 7. Export Settings
- Set up consistent export settings for icons
- Use 1x, 2x, 3x if needed, or SVG for scalability
- Name exports consistently (e.g., "icon-caution-12px.svg")

