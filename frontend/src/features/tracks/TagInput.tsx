import { useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '../../components/Button'
import { TextField } from '../../components/TextField'
import styles from './TagInput.module.css'
import { addTag, MAX_TAG_LENGTH, MAX_TAGS_PER_TRACK, TAG_ERROR_MESSAGES } from './tagRules'

export interface TagInputProps {
  id: string
  label: string
  /** Already normalised. The parent owns the list. */
  tags: string[]
  onChange: (tags: string[]) => void
}

/**
 * Adds and removes tags. Enter adds the tag and never submits the surrounding
 * form. A rejected tag shows an error on the field instead of being cut or dropped.
 */
export function TagInput({ id, label, tags, onChange }: TagInputProps) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [announcement, setAnnouncement] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function add() {
    const result = addTag(tags, draft)
    if (!result.ok) {
      setError(TAG_ERROR_MESSAGES[result.error])
      return
    }
    onChange(result.tags)
    setDraft('')
    setError(undefined)
    setAnnouncement(`Added tag ${result.tag}`)
    inputRef.current?.focus()
  }

  function remove(tag: string) {
    onChange(tags.filter((existing) => existing !== tag))
    setError(undefined)
    setAnnouncement(`Removed tag ${tag}`)
    // The button that had focus is gone, so put focus back in the field.
    inputRef.current?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    // Enter in this field is for adding a tag, never for submitting the form.
    event.preventDefault()
    if (draft.trim() !== '') add()
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.row}>
        <div className={styles.field}>
          <TextField
            ref={inputRef}
            id={id}
            label={label}
            hint={`Up to ${MAX_TAGS_PER_TRACK} tags, ${MAX_TAG_LENGTH} characters each. Press Enter to add.`}
            error={error}
            value={draft}
            autoComplete="off"
            onChange={(event) => {
              setDraft(event.target.value)
              setError(undefined)
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <Button onClick={add}>Add tag</Button>
      </div>

      {tags.length > 0 ? (
        <ul className={styles.tags} aria-label="Added tags">
          {tags.map((tag) => (
            <li key={tag} className={styles.tag}>
              <span>{tag}</span>
              <Button aria-label={`Remove tag ${tag}`} onClick={() => remove(tag)}>
                ×
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <p role="status" className="visually-hidden">
        {announcement}
      </p>
    </div>
  )
}
