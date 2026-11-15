/** The longest label the API accepts (maxLength in schema/openapi.json, for upload and PATCH). */
export const LABEL_MAX_LENGTH = 100

/**
 * react-hook-form validator for a label: true when fine, otherwise the message.
 * Counts characters, not UTF-16 units, after trimming, which is what the server
 * receives and counts.
 */
export function validateLabel(value: string): true | string {
  const length = [...value.trim()].length
  return length <= LABEL_MAX_LENGTH || `Use at most ${LABEL_MAX_LENGTH} characters`
}
