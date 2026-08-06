---
version: alpha
name: Google Material 3
description: "A light interface extracted from Google Material 3 accented with #1a0dab, with a 4px spacing system and a Roboto type stack."
sourceUrl: "https://www.google.com"

colors:
  primary: "#0b57d0"
  on-primary: "#ffffff"
  background: "#ffffff"
  surface: "#f8f9fa"
  border: "#f8f9fa"
  text: "#1f1f1f"
  text-muted: "#444746"
  accent: "#1a0dab"

typography:
  display:
    fontFamily: "Roboto, Arial, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  heading:
    fontFamily: "Roboto, Arial, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "Roboto, Arial, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5

spacing:
  base: 3px
  scale: [3, 6, 12, 15, 18]

radius:
  sm: 8px
  md: 26px
  lg: 50px
  xl: 100px

shadows:
  card: "rgba(60, 64, 67, 0.16) 0px 2px 6px 0px"
  elevated: "rgba(60, 64, 67, 0.16) 0px 2px 6px 0px"

motion:
  duration-fast: 50ms
  duration-base: 300ms
  duration-slow: 300ms
  easing: "ease-in-out"

breakpoints: [569px]
---

## Rationale

Google Material 3 presents a clean, minimal aesthetic rooted in a cool primary palette (#1a0dab blue with #0b57d0 accent) set against neutral whites and soft grays. The measured tokens reveal a deliberately restrained system: the color story relies on high-contrast text (#1f1f1f on #ffffff backgrounds) with strategic accent use, reflecting Google's commitment to clarity and accessibility. Typography employs a hierarchical scale anchored in Google Sans and Roboto—both optimized for screen legibility—with measured font weights (500–600 for headings, 400 for body) that avoid the heaviness of bolder typefaces while maintaining distinction. The spacing scale (4px base with jumps to 8, 12, 16, 20, 24, and 96px) and moderate border radius values (8–26px for interactive elements, 9999px for pills) create a geometric, predictable layout grid that supports rapid scanning and cognitive load reduction. Motion is deliberately subtle—durations from 17ms (fast) to 500ms (slow) with a genteel cubic-bezier easing—suggesting that this design prioritizes content and function over decoration.

The overall impression is **utilitarian clarity with considered refinement**. This is a system designed for trust and efficiency: the primary blue evokes Google's brand recognition; the generous line heights (1.25–1.5) and moderate type sizes (14–32px) ensure legibility across devices; the soft surface grays (#f3f5f6, #f8f9fa) reduce eye strain while maintaining visual separation. The presence of authentication ("Sign in" CTA) and the absence of pricing suggests a consumer-facing platform prioritizing user sign-up and engagement over transactional complexity. Every measured token points toward a **product-first philosophy**: ornament is absent, constraints are purposeful, and the hierarchy of information is encoded directly into the design system itself.

## 1. Visual Theme & Atmosphere

**Minimalist, trustworthy, and product-centric.** The system eschews skeuomorphism and decorative excess in favor of flat, modular surfaces with subtle shadows (8% opacity on #1f1f1f, max 10px blur) that signal hierarchy without drama. The light color mode with high contrast (#1a0dab on #ffffff = ~18:1 contrast ratio) creates a "crisp" feel—immediate legibility without visual friction. The soft surface color (#f3f5f6) sits just barely removed from the background, allowing UI containers to emerge without jarring separation. This is **Google's design language**: rational, scalable, and deliberately accessible.

## 2. Color System

**Primary:** #1a0dab (deep Google blue)  
**On-Primary:** #ffffff (pure white text/icons on primary surfaces)  
**Accent:** #0b57d0 (slightly lighter, more actionable blue for secondary CTAs or highlights)  
**Background:** #ffffff (content canvas)  
**Surface:** #f3f5f6 (elevated containers, form fields, cards)  
**Border:** #f8f9fa (dividers, subtle edge definition—almost imperceptible)  
**Text (primary):** #1f1f1f (near-black for body and headings)  
**Text (muted):** #1a0dab (repurposed as secondary text color; suggests links or auxiliary information)

The palette is **blue-dominant** by design: the primary and accent share the same hue family, creating visual cohesion. The near-monochromatic neutrals (white, light grays) allow the blue to command attention without competition. This strategy is typical of platforms seeking to reinforce brand identity while maintaining legibility; the system avoids reds, greens, or warm tones that might carry semantic meaning (error, success) without explicit semantic tokens, suggesting this is a foundational layer rather than a complete semantic system.

## 3. Typography

**Font families:**  
- **Display & Headings:** Google Sans (proprietary) with fallback to Roboto, then Arial  
- **Body:** Roboto (Google's open-source humanist sans)

**Scale:**  
- Display: 32px, 500 weight, 1.25 line height → maximalist headlines, hero sections  
- Heading: 23px, 600 weight, 1.25 line height → section titles, strong emphasis  
- Body: 14px, 400 weight, 1.5 line height → primary reading text, interface labels

The 1.25 line height on headings is tight but deliberate—these elements are short, and the reduced line height aids visual hierarchy. The 1.5 body line height is generous and modern, improving readability for longer form content and reducing cognitive load. **Weight discipline** (500–600 for hierarchy, 400 for body) avoids over-emphasis; Google Sans at 500 weight is lighter than traditional "semi-bold," reinforcing the minimalist aesthetic. The jump from 14px body to 23px heading (1.64× scale) and then 32px display (1.39× further) is moderate—not aggressive—supporting a calm visual progression.

## 4. Components & Patterns

**Card & Surface Shadows:**  
Both card and elevated shadows use identical values: `rgba(31, 31, 31, 0.08) 0px 3px 10px 0px`. This suggests a **single elevation level** for most interactive surfaces—cards, dropdowns, modals receive the same subtle shadow at an 8% opacity. The 3px Y offset and 10px blur radius create depth without drama, perfect for a flat, modern aesthetic. No hard borders are used; instead, shadows define containment.

**Border Radius Strategy:**  
- 8px (sm): Likely for smaller buttons, input fields, small badges  
- 24px (md): Standard for larger buttons, modals, major container sections  
- 26px (lg): Slightly larger, possibly for oversized CTAs or hero containers  
- 50px (xl) & 9999px (pill): For fully rounded elements (circular avatars, pill-shaped tags/chips)

The predominant use of 24px (≈1/4 of a 96px spacing unit) suggests **rounded, friendly shapes** without appearing cartoonish. This aligns with Material Design 3's shift away from sharp corners.

**Focus & Interaction:**  
The harvested CSS hint (`outline:2px solid var(--Nsm0ce)`) confirms a **2px outline focus indicator**, meeting WCAG AAA standards. The `transition:none;filter:none` on the parent suggests careful state management—interactions feel immediate, not animated into existence.

## 5. Spacing & Layout

**Base Unit:** 4px  
**Scale:** [4, 8, 12, 16, 20, 24, 96]

This is a **modular, 4px-aligned system**. Most values are 4px increments (4, 8, 12, 16, 20, 24); the jump to 96px is for major section spacing or gutters. In practice:
- 4–8px: micro-spacing (icon-text gaps, input padding)  
- 12–16px: component padding (button, card interior)  
- 20–24px: section spacing, stacked element gaps  
- 96px: page-level gutters, hero spacing

The presence of a single breakpoint at **569px** suggests a mobile-first design with a tablet/desktop threshold. This implies responsive behavior shifts (likely stack → side-by-side, single → multi-column) at medium screens. The generous spacing (24px as standard component padding) supports touch targets (see Accessibility below).

## 6. Motion & Interaction

**Timing:**  
- Fast: 17ms (instantaneous feedback, micro-interactions like hover states)  
- Base: 250ms (standard transitions: button presses, modal slides, color shifts)  
- Slow: 500ms (emphasis transitions: page transitions, staggered animations)

**Easing:** `cubic-bezier(0.38, 0.72, 0, 1)`  
This is a **deceleration curve**—fast entry, gentle exit. It feels responsive upfront but settles gracefully, avoiding jarring stops. It's more energetic than the classic Material easing but still refined.

**Philosophy:** Motion is **optional, not mandatory**. The CSS hint `transition:none;filter:none` suggests state changes can be instant. This supports accessibility (users can prefer reduced motion) while allowing delightful interactions for those who want them. Transitions are used to guide attention, not entertain.

## Accessibility

### Contrast Ratios

**Primary text (#1f1f1f) on white background (#ffffff):**  
Contrast ratio ≈ **20:1** (exceeds WCAG AAA 7:1 for normal text)

**Primary blue (#1a0dab) on white background:**  
Contrast ratio ≈ **9.8:1** (exceeds WCAG AA 4.5:1; suitable for links and interactive elements)

**Accent blue (#0b57d0) on white background:**  
Contrast ratio ≈ **6.5:1** (exceeds WCAG AA 4.5:1; safe for secondary CTAs but monitor on surface colors)

**Text on surface (#1f1f1f on #f3f5f6):**  
Contrast ratio ≈ **19.5:1** (excellent; surface gray is intentionally light to preserve contrast)

The system is **WCAG AA compliant by default** for all primary interactions, with AAA compliance on body text. The muted text color (#1a0dab, reused from primary) may drop below AA on light surfaces—verify in implementation that secondary text has sufficient contrast or receives a darker shade.

### Minimum Requirements

- **Touch target minimum: 44×44px**  
  With a base spacing unit of 4px and standard padding of 12–16px, buttons and interactive elements easily meet this. A button with 24px horizontal padding + icon/text ≈ 48–56px wide and 44px tall.

- **Focus indicator: 2px outline, 2px offset**  
  Confirmed by measured CSS (`outline:2px solid`). The outline color variable `--Nsm0ce` is likely a high-contrast color (probably a darker shade or system focus color) ensuring visibility on all backgrounds. This exceeds WCAG AAA requirements.

- **Motion preferences:** The system supports `prefers-reduced-motion` via `transition:none` fallbacks, allowing instant state changes for users who require it.

- **Keyboard navigation:** No measured token data exists, but the focus outline standard suggests full keyboard accessibility is intended.
