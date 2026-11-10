// Values of an analysis's error_code seen so far (docs/API.md and the engine).
// More may exist, so anything unknown falls back to generic copy that still
// shows the code, and callers never branch on the text.
const COPY: Record<string, string> = {
  silent: 'The file is silent, so there was nothing to measure.',
  empty_audio: 'The file contains no audio data.',
  no_audio_stream: 'No audio stream was found in that file. Check that it is an audio file.',
  ffprobe_failed:
    'The file could not be read. It may be damaged or in an unusual format. Try exporting it again.',
  ffmpeg_failed:
    'The file could not be decoded. It may be damaged or in an unusual format. Try exporting it again.',
  ffmpeg_timeout: 'The analysis took too long and was stopped. Try a shorter file.',
  parse_failed: 'The measurements could not be read back from the analysis tool.',
  ffmpeg_missing:
    'The server is missing a tool it needs for analysis. This is not a problem with your file.',
  ffprobe_missing:
    'The server is missing a tool it needs for analysis. This is not a problem with your file.',
  essentia_missing:
    'The server is missing a tool it needs for analysis. This is not a problem with your file.',
  interrupted: 'The server restarted while this was being analysed. Upload the file again.',
}

/** Text for a person, from a failed analysis's error_code. */
export function describeAnalysisError(code: string | null | undefined): string {
  if (code === null || code === undefined || code === '') return 'The analysis failed.'
  if (Object.hasOwn(COPY, code)) return COPY[code] ?? 'The analysis failed.'
  return `The analysis failed (${code}).`
}
