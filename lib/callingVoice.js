export function nativeCallingAvailable() {
  return typeof window !== "undefined" &&
    !!window.Android &&
    typeof window.Android.speak === "function"
}

export function unlockCallingAudio() {
  if (typeof window === "undefined") return
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (AudioCtx) {
      const ctx = new AudioCtx()
      if (ctx.state === "suspended") void ctx.resume()
      setTimeout(() => { try { void ctx.close() } catch {} }, 250)
    }
  } catch {}
  try {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices()
      // Some Chromium builds need a short silent utterance after the first
      // user gesture to initialise the speech engine.
      const u = new SpeechSynthesisUtterance("")
      u.volume = 0
      window.speechSynthesis.speak(u)
    }
  } catch {}
}

function browserSpeak(text, { language="hi-IN", voiceName="", volume=1, rate=.9, repeat=3, onDone, onError } = {}) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onError?.("Speech synthesis is unavailable on this browser/device.")
    return false
  }

  const synth = window.speechSynthesis
  synth.cancel()

  let index = 0
  let finished = false
  let voiceHandler = null
  let timer = null

  const cleanup = () => {
    if (voiceHandler) synth.removeEventListener?.("voiceschanged", voiceHandler)
    if (timer) clearTimeout(timer)
  }

  const done = () => {
    if (finished) return
    finished = true
    cleanup()
    onDone?.()
  }

  const fail = (message) => {
    if (finished) return
    finished = true
    cleanup()
    onError?.(message)
  }

  const chooseVoice = () => {
    const voices = synth.getVoices ? synth.getVoices() : []
    const lang = String(language || "hi-IN").toLowerCase()
    const preferredName = String(voiceName || "").trim().toLowerCase()
    if (preferredName) {
      const named = voices.find(v => String(v.name || "").trim().toLowerCase() === preferredName)
      if (named) return named
    }
    return voices.find(v => String(v.lang || "").toLowerCase() === lang) ||
      voices.find(v => String(v.lang || "").toLowerCase().startsWith(lang.split("-")[0])) ||
      voices.find(v => String(v.lang || "").toLowerCase().startsWith("hi")) ||
      voices.find(v => String(v.lang || "").toLowerCase().startsWith("en")) ||
      voices[0]
  }

  const run = () => {
    if (finished) return
    if (index >= repeat) return done()

    const utterance = new SpeechSynthesisUtterance(String(text))
    utterance.lang = String(language || "hi-IN")
    utterance.volume = Number(volume)
    utterance.rate = Number(rate)
    const voice = chooseVoice()
    if (voice) utterance.voice = voice

    utterance.onend = () => {
      index += 1
      timer = setTimeout(run, 300)
    }
    utterance.onerror = event => {
      const code = event?.error || "Speech synthesis failed"
      // interrupted/canceled can happen when a new announcement supersedes
      // an old one; do not turn that normal condition into a permanent error.
      if (code === "canceled" || code === "interrupted") return
      fail(code)
    }
    synth.speak(utterance)
  }

  const voices = synth.getVoices ? synth.getVoices() : []
  if (!voices.length) {
    voiceHandler = () => {
      if (voiceHandler) synth.removeEventListener?.("voiceschanged", voiceHandler)
      voiceHandler = null
      run()
    }
    synth.addEventListener?.("voiceschanged", voiceHandler)
    timer = setTimeout(() => {
      if (voiceHandler) {
        synth.removeEventListener?.("voiceschanged", voiceHandler)
        voiceHandler = null
      }
      run()
    }, 800)
  } else {
    run()
  }

  return true
}

export function speakCallingAnnouncement(text, config={}, callbacks={}) {
  const repeat = Math.max(1, Math.min(5, Number(config.repeat ?? 3)))
  const language = config.language || "hi-IN"
  const voiceName = String(config.voiceName || "").trim()
  const volume = Math.max(0, Math.min(1, Number(config.volume ?? 1)))
  const rate = Math.max(.5, Math.min(2, Number(config.rate ?? .9)))

  unlockCallingAudio()

  if (nativeCallingAvailable()) {
    try {
      window.Android.speak(String(text), String(language), Number(rate), Number(volume), Number(repeat))
      callbacks.onDone?.()
      return true
    } catch (error) {
      console.warn("Native TTS bridge failed; using browser speech fallback.", error)
    }
  }

  return browserSpeak(String(text), {
    language, voiceName, volume, rate, repeat,
    onDone: callbacks.onDone,
    onError: callbacks.onError,
  })
}
