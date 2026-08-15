// Press-to-talk mic capture + client-side VAD + audio playback.
// Sarvam's STT accepts WebM directly, so no client-side transcoding.
//
// Recording still starts on press (avoids capturing ambient noise before
// the child means to speak), but VAD can end it automatically once they
// stop talking (CLAUDE.md §8 item 4) — releasing the button early still
// works too, whichever happens first wins.

let mediaRecorder = null
let chunks = []
let activeStream = null

let audioContext = null
let analyser = null
let vadIntervalId = null

const VAD_CHECK_MS = 100
const VAD_SILENCE_THRESHOLD_DB = -45
const VAD_MIN_SPEECH_MS = 300
const VAD_SILENCE_HOLD_MS = 1000

export function isVoiceSupported() {
  return (
    typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== 'undefined'
  )
}

// onAutoStop is optional — called once if VAD detects the child has
// stopped talking. The caller (MicButton) treats it exactly like a manual
// release.
export async function startRecording(onAutoStop) {
  if (!isVoiceSupported()) throw new Error('Voice capture is not supported in this browser')
  activeStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  chunks = []
  const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
  mediaRecorder = new MediaRecorder(activeStream, mimeType ? { mimeType } : undefined)
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }
  mediaRecorder.start()

  if (onAutoStop) {
    startVAD(activeStream, onAutoStop)
  }
}

export function stopRecording() {
  return new Promise((resolve, reject) => {
    if (!mediaRecorder) {
      reject(new Error('Not currently recording'))
      return
    }
    const recorder = mediaRecorder
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
      cleanup()
      resolve(blob)
    }
    recorder.onerror = (e) => {
      cleanup()
      reject(e.error || new Error('Recording failed'))
    }
    recorder.stop()
  })
}

function cleanup() {
  stopVAD()
  activeStream?.getTracks().forEach((track) => track.stop())
  activeStream = null
  mediaRecorder = null
  chunks = []
}

function startVAD(stream, onSilenceAfterSpeech) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return // no VAD support — press-to-talk release still works
  audioContext = new Ctx()
  const source = audioContext.createMediaStreamSource(stream)
  analyser = audioContext.createAnalyser()
  analyser.fftSize = 512
  source.connect(analyser)

  const data = new Uint8Array(analyser.frequencyBinCount)
  let speechStartedAt = null
  let silenceStartedAt = null

  vadIntervalId = setInterval(() => {
    analyser.getByteTimeDomainData(data)
    let sumSquares = 0
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128
      sumSquares += v * v
    }
    const rms = Math.sqrt(sumSquares / data.length)
    const db = 20 * Math.log10(rms || 0.0001)
    const isSpeech = db > VAD_SILENCE_THRESHOLD_DB
    const now = Date.now()

    if (isSpeech) {
      if (!speechStartedAt) speechStartedAt = now
      silenceStartedAt = null
      return
    }

    if (!speechStartedAt || now - speechStartedAt < VAD_MIN_SPEECH_MS) return // hasn't really spoken yet

    if (!silenceStartedAt) {
      silenceStartedAt = now
    } else if (now - silenceStartedAt > VAD_SILENCE_HOLD_MS) {
      onSilenceAfterSpeech()
    }
  }, VAD_CHECK_MS)
}

function stopVAD() {
  if (vadIntervalId) clearInterval(vadIntervalId)
  vadIntervalId = null
  if (audioContext) {
    audioContext.close().catch(() => {})
  }
  audioContext = null
  analyser = null
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error || new Error('Could not read audio'))
    reader.readAsDataURL(blob)
  })
}

export function playAudioFromBase64(base64, mimeType = 'audio/wav') {
  return new Promise((resolve, reject) => {
    try {
      const audio = new Audio(`data:${mimeType};base64,${base64}`)
      audio.onended = () => resolve()
      audio.onerror = () => reject(new Error('Audio playback failed'))
      audio.play().catch(reject)
    } catch (e) {
      reject(e)
    }
  })
}

// Sequential player for progressively-arriving audio chunks (streaming
// voice path). Each enqueued chunk must be independently playable — the
// backend synthesizes each clause as one complete WAV before sending it.
export class AudioQueue {
  constructor(mimeType = 'audio/wav') {
    this.mimeType = mimeType
    this.queue = []
    this.playing = false
  }

  enqueue(base64Chunk) {
    this.queue.push(base64Chunk)
    if (!this.playing) this._playNext()
  }

  _playNext() {
    const next = this.queue.shift()
    if (!next) {
      this.playing = false
      return
    }
    this.playing = true
    const audio = new Audio(`data:${this.mimeType};base64,${next}`)
    audio.onended = () => this._playNext()
    audio.onerror = () => this._playNext()
    audio.play().catch(() => this._playNext())
  }
}
