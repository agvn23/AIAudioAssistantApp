import { useId, useSyncExternalStore, type ChangeEvent } from 'react'
import styles from './ThemeSwitch.module.css'
import { THEME_PREFERENCES, themeStore, type ThemePreference } from './themeStore'

const LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
}

function isPreference(value: string): value is ThemePreference {
  return (THEME_PREFERENCES as readonly string[]).includes(value)
}

/** Chooses system, light or dark. The choice is saved by the theme store. */
export function ThemeSwitch() {
  const id = useId()
  const preference = useSyncExternalStore(themeStore.subscribe, themeStore.get)

  function onChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value
    if (isPreference(value)) themeStore.set(value)
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        Theme
      </label>
      <select id={id} className={styles.select} value={preference} onChange={onChange}>
        {THEME_PREFERENCES.map((option) => (
          <option key={option} value={option}>
            {LABELS[option]}
          </option>
        ))}
      </select>
    </div>
  )
}
