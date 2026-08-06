---
version: alpha
name: Klassik/Main
description: "A clean, conventional 'standard UI' — neutral colors, functional forms, plain typography, no decoration. Deliberately unremarkable, maximally legible."

colors:
  primary: "#2563eb"
  on-primary: "#ffffff"
  background: "#f5f5f5"
  surface: "#ffffff"
  surface-elevated: "#f9fafb"
  border: "#d1d5db"
  border-strong: "#9ca3af"
  text: "#111827"
  text-muted: "#6b7280"
  text-disabled: "#9ca3af"
  danger: "#dc2626"
  danger-bg: "#fef2f2"
  success: "#16a34a"
  success-bg: "#f0fdf4"
  warning: "#d97706"
  warning-bg: "#fffbeb"
  nav-bg: "#ffffff"
  nav-border: "#e5e7eb"
  player-bg: "#ffffff"
  player-border: "#e5e7eb"

typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.3
  heading:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 18px
    fontWeight: 600
    lineHeight: 1.4
  subheading:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.6
  caption:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.4

spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  xxl: 32px
  section: 48px

radius:
  sm: 4px
  md: 8px
  lg: 12px
  full: 9999px

shadows:
  card: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)"
  elevated: "0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)"

motion:
  duration-fast: 100ms
  duration-base: 200ms
  duration-slow: 300ms
  easing: "ease-in-out"

breakpoints: [640px, 1024px]
---

## Overview

The Klassik/Main design is intentionally unremarkable — a "08/15" standard UI that prioritizes clarity and function over aesthetic expression. Clean forms, neutral grays, standard sans-serif typography. Nothing about this design should surprise or delight; it should feel immediately familiar to any user of conventional software.

## Design Principles

1. **Function over form** — Every element earns its place by doing work, not by looking interesting.
2. **Neutral palette** — Blues for interactive elements, grays for structure, no warm or expressive colors in the chrome.
3. **Standard conventions** — Buttons look like buttons, inputs look like inputs, tables look like tables.
4. **Consistent spacing** — 8px base unit, predictable component padding throughout.

## Layout

- **Top navigation bar**: White background, 1px border-bottom, wordmark left, user actions right.
- **Bottom navigation** (mobile): Tab bar with text labels + simple icons.
- **Content area**: Centered max-width column (960px desktop, full-width mobile), 16px horizontal padding.
- **Now-playing bar**: Fixed bottom, white background, standard playback controls in a horizontal row.

## Colors

- **Primary (`#2563eb`)**: Conventional "link blue" — buttons, active states, focus rings.
- **Background (`#f5f5f5`)**: Light gray page background — separates content containers from the page.
- **Surface (`#ffffff`)**: Cards, modals, input backgrounds.
- **Border (`#d1d5db`)**: Consistent 1px border on all containers and inputs.
- **Text (`#111827`)**: Near-black for maximum legibility.
- **Text Muted (`#6b7280`)**: Secondary text, captions, placeholder.

## Typography

- **Font**: Inter — the most neutral, legible sans-serif for interfaces.
- **Scale**: Display (24px) → Heading (18px) → Body (14px) → Caption (12px).
- **No monospace, no decorative fonts** — strictly functional.

## Components

### Buttons
- **Primary**: Blue fill (`#2563eb`), white text, 4px radius, 8px×16px padding, 36px height.
- **Secondary**: White fill, 1px border (`#d1d5db`), dark text, 4px radius.
- **Danger**: Red fill (`#dc2626`), white text.
- **Disabled**: Gray fill, muted text, no cursor.

### Inputs
- 1px solid border (`#d1d5db`), white background, 4px radius, 8px padding, 36px height.
- Focus: 2px solid blue outline, border-color `#2563eb`.
- Error: red border, red helper text below.

### Cards
- White background, 1px border (`#d1d5db`), 8px radius, `card` shadow.
- No hover elevation change — static, stable containers.

### Navigation Icons
- Simple inline SVG icons — no color fill, 1.5px stroke, 20px square.
- Icons: Home (house outline), Search (magnifying glass), Library (stack of books), Play (triangle), Pause (two bars), Settings (gear), Download (arrow down to line).

## Do's and Don'ts

### Do
- Use `#2563eb` for all interactive primary actions.
- Use 1px borders to define containers, never shadows alone.
- Keep form labels above inputs, never floating or inline.
- Keep error messages in red below the field, not in a toast.

### Don't
- Don't use gradients, glassmorphism, or decorative backgrounds.
- Don't use animation for anything but state transitions (max 200ms).
- Don't use icons without text labels in the bottom navigation.
- Don't vary spacing arbitrarily — stick to the 8px scale.
