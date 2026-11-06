import { configureAxe } from 'vitest-axe'
import { expect } from 'vitest'

// jsdom has no layout engine, so colour contrast cannot be computed here (check
// it by hand in a browser). "region" is a whole-page rule that fires on
// components rendered without page landmarks.
const axe = configureAxe({
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
})

export async function expectNoA11yViolations(container: Element): Promise<void> {
  const results = await axe(container)
  expect(results.violations).toEqual([])
}
