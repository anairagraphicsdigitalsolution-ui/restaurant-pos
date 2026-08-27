import { Capacitor } from "@capacitor/core"
import { TextToSpeech, QueueStrategy } from "@capacitor-community/text-to-speech"

let nativeVoicesPromise = null

function isNativeTtsAvailable() {
  try {
    return Capacitor.isNativePlatform() && typeof TextToSpeech?.speak === "function"
  } catch {
    return false
  }
}

export function nativeCallingAvailable() {
  return isNativeTtsAvailable()
}

export function unlockCallingAudio() {
  if (typeof window === "undefined") return
  // Native Capacitor TTS does not require a WebView audio unlock. Keep the
  // browser unlock only for the web fallback.
  if (isNativeTtsAvailable()) return
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (AudioCtx) {
      const ctx = new AudioCtx()
      if (ctx.state === "suspended") void ctx.resume()
      setTimeout(() => { try { void ctx.close() } catch {} }, 250)
    }
  } catch {}
  try {
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices()
  } catch {}
}

async function getNativeVoices() {
  if (!isNativeTtsAvailable()) return []
  if (!nativeVoicesPromise) {
    nativeVoicesPromise = TextToSpeech.getSupportedVoices()
      .then(result => Array.isArray(result?.voices) ? result.voices : [])
      .catch(() => [])
  }
  return nativeVoicesPromise
}

async function nativeSpeak(text, { language="hi-IN", voiceName="", volume=1, rate=.9, repeat=3 } = {}) {
  if (!isNativeTtsAvailable()) return false

  const lang = String(language || "hi-IN")
  const voices = await getNativeVoices()
  const wanted = String(voiceName || "").trim().toLowerCase()
  const exactName = wanted ? voices.find(v => String(v.name || "").trim().toLowerCase() === wanted) : null
  const exactLang = voices.find(v => String(v.lang || "").toLowerCase() === lang.toLowerCase())
  const baseLang = lang.toLowerCase().split("-")[0]
  const baseMatch = voices.find(v => String(v.lang || "").toLowerCase().startsWith(baseLang))
  const voice = exactName || exactLang || baseMatch

  const supported = await TextToSpeech.isLanguageSupported({ lang }).catch(() => ({ supported: true }))
  if (supported?.supported === false && !voice) {
    throw new Error(`Android TTS language ${lang} is not installed or supported.`)
  }

  const count = Math.max(1, Math.min(5, Number(repeat ?? 3)))
  for (let i = 0; i < count; i += 1) {
    await TextToSpeech.speak({
      text: String(text),
      lang,
      rate: Math.max(.5, Math.min(2, Number(rate ?? .9))),
      pitch: 1,
      volume: Math.max(0, Math.min(1, Number(volume ?? 1))),
      voice: voice?.index,
      queueStrategy: QueueStrategy.Add,
    })
  }
  return true
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
  const cleanup = () => { if (voiceHandler) synth.removeEventListener?.("voiceschanged", voiceHandler); if (timer) clearTimeout(timer) }
  const done = () => { if (finished) return; finished = true; cleanup(); onDone?.() }
  const fail = message => { if (finished) return; finished = true; cleanup(); onError?.(message) }
  const chooseVoice = () => {
    const voices = synth.getVoices ? synth.getVoices() : []
    const lang = String(language || "hi-IN").toLowerCase()
    const preferred = String(voiceName || "").trim().toLowerCase()
    if (preferred) { const named = voices.find(v => String(v.name || "").trim().toLowerCase() === preferred); if (named) return named }
    return voices.find(v => String(v.lang || "").toLowerCase() === lang) || voices.find(v => String(v.lang || "").toLowerCase().startsWith(lang.split("-")[0])) || voices.find(v => String(v.lang || "").toLowerCase().startsWith("hi")) || voices.find(v => String(v.lang || "").toLowerCase().startsWith("en")) || voices[0]
  }
  const run = () => {
    if (finished) return
    if (index >= repeat) return done()
    const u = new SpeechSynthesisUtterance(String(text))
    u.lang = String(language || "hi-IN"); u.volume = Number(volume); u.rate = Number(rate)
    const voice = chooseVoice(); if (voice) u.voice = voice
    u.onend = () => { index += 1; timer = setTimeout(run, 300) }
    u.onerror = event => { const code = event?.error || "Speech synthesis failed"; if (code === "canceled" || code === "interrupted") return; fail(code) }
    synth.speak(u)
  }
  const voices = synth.getVoices ? synth.getVoices() : []
  if (!voices.length) {
    voiceHandler = () => { if (voiceHandler) synth.removeEventListener?.("voiceschanged", voiceHandler); voiceHandler = null; run() }
    synth.addEventListener?.("voiceschanged", voiceHandler)
    timer = setTimeout(() => { if (voiceHandler) { synth.removeEventListener?.("voiceschanged", voiceHandler); voiceHandler = null }; run() }, 800)
  } else run()
  return true
}

export function speakCallingAnnouncement(text, config={}, callbacks={}) {
  const repeat = Math.max(1, Math.min(5, Number(config.repeat ?? 3)))
  const language = config.language || "hi-IN"
  const voiceName = String(config.voiceName || "").trim()
  const volume = Math.max(0, Math.min(1, Number(config.volume ?? 1)))
  const rate = Math.max(.5, Math.min(2, Number(config.rate ?? .9)))

  if (isNativeTtsAvailable()) {
    void nativeSpeak(text, { language, voiceName, volume, rate, repeat })
      .then(() => callbacks.onDone?.())
      .catch(error => callbacks.onError?.(error?.message || String(error)))
    return true
  }

  unlockCallingAudio()
  return browserSpeak(String(text), { language, voiceName, volume, rate, repeat, onDone: callbacks.onDone, onError: callbacks.onError })
}
