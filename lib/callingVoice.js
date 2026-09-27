// Calling voice runtime is intentionally browser/native lazy-loaded.
// Do not import the Capacitor TTS plugin at module evaluation time: Next.js
// server rendering can evaluate client modules too, and Capacitor's plugin
// registry must only be touched inside the browser/native runtime.

let nativeTtsModulePromise = null

async function getNativeTtsModule() {
  if (typeof window === "undefined") return null
  if (!nativeTtsModulePromise) {
    nativeTtsModulePromise = (async () => {
      try {
        const [{ Capacitor }, tts] = await Promise.all([
          import("@capacitor/core"),
          import("@capacitor-community/text-to-speech"),
        ])
        if (!Capacitor.isNativePlatform()) return null
        if (typeof tts?.TextToSpeech?.speak !== "function") return null
        return { Capacitor, TextToSpeech: tts.TextToSpeech, QueueStrategy: tts.QueueStrategy }
      } catch (error) {
        console.warn("Native TTS is unavailable; browser speech will be used.", error)
        return null
      }
    })()
  }
  return nativeTtsModulePromise
}

export function nativeCallingAvailable() {
  // This remains synchronous for existing callers. The actual plugin is
  // loaded lazily by speakCallingAnnouncement/nativeSpeak when needed.
  return typeof window !== "undefined" && !!window.Capacitor?.isNativePlatform
}

export function unlockCallingAudio() {
  if (typeof window === "undefined") return
  // Browser fallback only. Native TTS does not need a Web Audio unlock.
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

async function nativeSpeak(text, { language="hi-IN", voiceName="", volume=1, rate=.9, repeat=3 } = {}) {
  const mod = await getNativeTtsModule()
  if (!mod) return false

  const { TextToSpeech, QueueStrategy } = mod
  const lang = String(language || "hi-IN")
  const voices = await TextToSpeech.getSupportedVoices().catch(() => [])
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
  const cleanup = () => {
    if (voiceHandler) synth.removeEventListener?.("voiceschanged", voiceHandler)
    if (timer) clearTimeout(timer)
  }
  const done = () => { if (finished) return; finished = true; cleanup(); onDone?.() }
  const fail = message => { if (finished) return; finished = true; cleanup(); onError?.(message) }
  const chooseVoice = () => {
    const voices = synth.getVoices ? synth.getVoices() : []
    const lang = String(language || "hi-IN").toLowerCase()
    const preferred = String(voiceName || "").trim().toLowerCase()
    if (preferred) {
      const named = voices.find(v => String(v.name || "").trim().toLowerCase() === preferred)
      if (named) return named
    }
    return voices.find(v => String(v.lang || "").toLowerCase() === lang) ||
      voices.find(v => String(v.lang || "").toLowerCase().startsWith(lang.split("-")[0])) ||
      voices.find(v => String(v.lang || "").toLowerCase().startsWith("hi")) ||
      voices.find(v => String(v.lang || "").toLowerCase().startsWith("en")) || voices[0]
  }
  const run = () => {
    if (finished) return
    if (index >= repeat) return done()
    const u = new SpeechSynthesisUtterance(String(text))
    u.lang = String(language || "hi-IN")
    u.volume = Number(volume)
    u.rate = Number(rate)
    const voice = chooseVoice()
    if (voice) u.voice = voice
    u.onend = () => { index += 1; timer = setTimeout(run, 300) }
    u.onerror = event => {
      const code = event?.error || "Speech synthesis failed"
      if (code === "canceled" || code === "interrupted") return
      fail(code)
    }
    synth.speak(u)
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
  } else run()
  return true
}

export async function playCallingAudio(url, { volume=1 } = {}) {
  if (typeof window === "undefined" || !url) return false
  return await new Promise(resolve => {
    try {
      const audio = new Audio(String(url))
      audio.preload = "auto"
      audio.volume = Math.max(0, Math.min(1, Number(volume ?? 1)))
      let settled = false
      const finish = value => { if (settled) return; settled = true; resolve(value) }
      audio.onended = () => finish(true)
      audio.onerror = () => finish(false)
      void audio.play().then(() => {}).catch(() => finish(false))
    } catch { resolve(false) }
  })
}

export function speakCallingAnnouncement(text, config={}, callbacks={}) {
  const repeat = Math.max(1, Math.min(5, Number(config.repeat ?? 3)))
  const language = config.language || "hi-IN"
  const voiceName = String(config.voiceName || "").trim()
  const volume = Math.max(0, Math.min(1, Number(config.volume ?? 1)))
  const rate = Math.max(.5, Math.min(2, Number(config.rate ?? .9)))
  const audioUrl = String(config.audioUrl || "").trim()

  if (typeof window !== "undefined") {
    if (audioUrl) {
      void (async () => {
        let ok = true
        for (let i = 0; i < repeat; i += 1) {
          ok = await playCallingAudio(audioUrl, { volume })
          if (!ok) break
          if (i < repeat - 1) await new Promise(r => setTimeout(r, 250))
        }
        if (ok) callbacks.onDone?.()
        else {
          browserSpeak(String(text), { language, voiceName, volume, rate, repeat, onDone: callbacks.onDone, onError: callbacks.onError })
        }
      })()
      return true
    }
    void getNativeTtsModule().then(mod => {
      if (!mod) return null
      return nativeSpeak(text, { language, voiceName, volume, rate, repeat })
    }).then(nativeResult => {
      if (nativeResult === true) callbacks.onDone?.()
      else if (nativeResult === false) browserSpeak(String(text), { language, voiceName, volume, rate, repeat, onDone: callbacks.onDone, onError: callbacks.onError })
    }).catch(error => callbacks.onError?.(error?.message || String(error)))
    return true
  }
  return false
}
