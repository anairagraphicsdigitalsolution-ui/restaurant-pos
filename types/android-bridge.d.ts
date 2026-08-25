export {};
declare global {
  interface Window {
    Android?: {
      speak?: (text: string, language: string, rate: number, volume: number, repeat: number) => void
      notify?: (title: string, message: string, actionUrl?: string) => void
      notifyTone?: () => void
    }
  }
}
