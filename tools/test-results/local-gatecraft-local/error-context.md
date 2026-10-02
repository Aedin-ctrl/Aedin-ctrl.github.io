# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: local.spec.mjs >> gatecraft local
- Location: visual/local.spec.mjs:2:1

# Error details

```
Error: expect(page).toHaveScreenshot(expected) failed

  1595 pixels (ratio 0.01 of all image pixels) are different.

  Snapshot: gatecraft-local.png

Call log:
  - Expect "toHaveScreenshot(gatecraft-local.png)" with timeout 5000ms
    - verifying given screenshot expectation
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - 1595 pixels (ratio 0.01 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - taking page screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - captured a stable screenshot
  - 1595 pixels (ratio 0.01 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - generic [ref=e3]: Gatecraft · logic you can wire up
    - button "Running" [ref=e4] [cursor=pointer]
    - button "Tick" [ref=e5] [cursor=pointer]
    - button "Clear" [ref=e6] [cursor=pointer]
    - button "Make chip" [ref=e7] [cursor=pointer]
    - button "Panel" [ref=e8] [cursor=pointer]
    - button "Copy link" [ref=e9] [cursor=pointer]
    - button "Open…" [ref=e10] [cursor=pointer]
  - main [ref=e11]:
    - complementary [ref=e12]:
      - heading "Parts" [level=2] [ref=e13]
      - button "Switch" [ref=e14] [cursor=pointer]
      - button "Lamp" [ref=e19] [cursor=pointer]
      - button "Number" [ref=e23] [cursor=pointer]
      - button "NOT" [ref=e27] [cursor=pointer]
      - button "AND" [ref=e32] [cursor=pointer]
      - button "OR" [ref=e36] [cursor=pointer]
      - button "XOR" [ref=e40] [cursor=pointer]
      - button "NAND" [ref=e45] [cursor=pointer]
      - button "NOR" [ref=e50] [cursor=pointer]
      - button "XNOR" [ref=e55] [cursor=pointer]
      - button "D-FF" [ref=e61] [cursor=pointer]
      - button "Clock" [ref=e66] [cursor=pointer]
    - generic [ref=e71]:
      - generic:
        - generic: Pick a part, click to place it
        - text: Drag from one pin to another to wire them. Click a switch to flip it.
    - generic [ref=e73]:
      - heading "Truth table" [level=2] [ref=e74]
      - paragraph [ref=e76]: Add switches and lamps to see one.
      - heading "Examples" [level=2] [ref=e77]
      - generic [ref=e78]:
        - 'button "Half adder Adds two bits: sum and carry" [ref=e79] [cursor=pointer]':
          - text: Half adder
          - generic [ref=e80]: "Adds two bits: sum and carry"
        - button "Full adder Adds three bits — chain these to add real numbers" [ref=e81] [cursor=pointer]:
          - text: Full adder
          - generic [ref=e82]: Adds three bits — chain these to add real numbers
        - button "Latch (remembers) Press Set, let go — it stays on" [ref=e83] [cursor=pointer]:
          - text: Latch (remembers)
          - generic [ref=e84]: Press Set, let go — it stays on
        - button "Flip-flop + clock Halves the clock — the start of counting" [ref=e85] [cursor=pointer]:
          - text: Flip-flop + clock
          - generic [ref=e86]: Halves the clock — the start of counting
        - button "Two-bit counter Counts 0,1,2,3 and round again — watch the lamps" [ref=e87] [cursor=pointer]:
          - text: Two-bit counter
          - generic [ref=e88]: Counts 0,1,2,3 and round again — watch the lamps
        - button "Full adder, from chips The same thing again — but out of two reusable chips" [ref=e89] [cursor=pointer]:
          - text: Full adder, from chips
          - generic [ref=e90]: The same thing again — but out of two reusable chips
        - button "Counting to fifteen Four flip-flops counting 0 to F — watch the number" [ref=e91] [cursor=pointer]:
          - text: Counting to fifteen
          - generic [ref=e92]: Four flip-flops counting 0 to F — watch the number
        - button "Majority vote On when at least two of three are on" [ref=e93] [cursor=pointer]:
          - text: Majority vote
          - generic [ref=e94]: On when at least two of three are on
      - heading "Keys" [level=2] [ref=e95]
      - paragraph [ref=e96]: 1–9 pick a part · Esc deselect · Delete remove · ⌘Z undo · D darkDouble-tap a switch or lamp to name it, or a chip to look inside it.
```

# Test source

```ts
  1 | import { test, expect } from '@playwright/test';
  2 | test('gatecraft local', async ({ page }) => {
  3 |   await page.setViewportSize({ width: 1280, height: 900 });
  4 |   await page.goto('/gatecraft/', { waitUntil: 'load' });
  5 |   await page.waitForTimeout(2000);
> 6 |   await expect(page).toHaveScreenshot('gatecraft-local.png', { animations: 'disabled' });
    |                      ^ Error: expect(page).toHaveScreenshot(expected) failed
  7 | });
  8 | 
```