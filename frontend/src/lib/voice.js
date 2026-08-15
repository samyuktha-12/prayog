// Press-to-talk mic capture + audio playback. No VAD, no barge-in — the
// caller (MicButton) controls start/stop explicitly (CLAUDE.md §3/§8).
// Sarvam's STT accepts WebM directly, so no client-side transcoding.

let mediaRecorder = null
let chunks = []
let activeStream = null

export function isVoiceSupported() {
  return (
    typeof window !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== 'undefined'
  )
}

export async function startRecording() {
  if (!isVoiceSupported()) throw new Error('Voice capture is not supported in this browser')
  activeStream = await navigator.mediaDevices.getUserMedia({ audio: true })
  chunks = []
  const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
  mediaRecorder = new MediaRecorder(activeStream, mimeType ? { mimeType } : undefined)
  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data)
  }
  mediaRecorder.start()
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
  activeStream?.getTracks().forEach((track) => track.stop())
  activeStream = null
  mediaRecorder = null
  chunks = []
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
