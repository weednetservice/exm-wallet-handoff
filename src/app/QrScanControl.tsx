import { useEffect, useRef, useState, type ChangeEvent } from "react"
import type { IScannerControls } from "@zxing/browser"
import { IconScan } from "./glyph"
import "./screens/secondary-flows.css"

/** Camera and image decoding stay on this device. The caller validates the decoded address. */
export function QrScanControl({ onScan, autoStart = false }: { onScan: (raw: string) => string | null; autoStart?: boolean }) {
  const [open, setOpen] = useState(autoStart)
  const [camera, setCamera] = useState(autoStart)
  const [busy, setBusy] = useState(autoStart)
  const [imageBusy, setImageBusy] = useState(false)
  const [error, setError] = useState("")
  const [videoNode, setVideoNode] = useState<HTMLVideoElement | null>(null)
  const controls = useRef<IScannerControls | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const onScanRef = useRef(onScan)
  const cameraEpoch = useRef(0)
  const imageEpoch = useRef(0)
  const mounted = useRef(false)
  onScanRef.current = onScan
  const stopCamera = () => {
    cameraEpoch.current += 1
    controls.current?.stop()
    controls.current = null
    if (videoNode?.srcObject instanceof MediaStream) videoNode.srcObject.getTracks().forEach((track) => track.stop())
    setCamera(false)
    setBusy(false)
  }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; cameraEpoch.current += 1; imageEpoch.current += 1 }
  }, [])
  const accept = (raw: string) => {
    const rejection = onScanRef.current(raw)
    if (rejection) { setError(rejection); return false }
    setError("")
    stopCamera()
    setOpen(false)
    return true
  }

  useEffect(() => {
    if (!camera || !videoNode) return
    let cancelled = false
    let stream: MediaStream | null = null
    const epoch = ++cameraEpoch.current
    const active = () => !cancelled && cameraEpoch.current === epoch
    const openCamera = Promise.resolve()
      .then(() => navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } }))
      .then((openedStream) => {
        stream = openedStream
        if (!active()) openedStream.getTracks().forEach((track) => track.stop())
        return openedStream
      })
    Promise.all([openCamera, import("@zxing/browser")]).then(([openedStream, { BrowserQRCodeReader }]) => {
      if (!active()) return
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 180, delayBetweenScanSuccess: 450 })
      return reader.decodeFromStream(openedStream, videoNode, (result) => {
        if (!result || !active()) return
        if (accept(result.getText())) controls.current?.stop()
      })
    }).then((session) => {
      if (!session) return
      if (!active()) session.stop()
      else controls.current = session
    }).catch((cause: unknown) => {
      if (!active()) return
      const name = cause instanceof DOMException ? cause.name : ""
      setError(name === "NotAllowedError" ? "Доступ к камере закрыт. Разрешите его в браузере или выберите изображение с QR." : name === "NotFoundError" ? "Камера не найдена. Выберите изображение с QR." : "Не удалось открыть камеру. Выберите изображение с QR.")
      setBusy(false)
      setCamera(false)
    }).finally(() => { if (active()) setBusy(false) })
    return () => {
      cancelled = true
      if (cameraEpoch.current === epoch) cameraEpoch.current += 1
      controls.current?.stop()
      controls.current = null
      stream?.getTracks().forEach((track) => track.stop())
      if (videoNode.srcObject instanceof MediaStream) videoNode.srcObject.getTracks().forEach((track) => track.stop())
    }
  }, [camera, videoNode])

  useEffect(() => {
    if (!camera) return
    const pause = () => { if (document.hidden) stopCamera() }
    document.addEventListener("visibilitychange", pause)
    return () => document.removeEventListener("visibilitychange", pause)
  }, [camera])

  const file = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    event.target.value = ""
    if (!selected) return
    const epoch = ++imageEpoch.current
    const active = () => mounted.current && imageEpoch.current === epoch
    setError("")
    setImageBusy(true)
    const url = URL.createObjectURL(selected)
    try {
      const image = new Image()
      image.src = url
      const [, { BrowserQRCodeReader }] = await Promise.all([image.decode(), import("@zxing/browser")])
      if (!active()) return
      const canvas = document.createElement("canvas")
      const largest = Math.max(image.naturalWidth, image.naturalHeight)
      const scale = largest < 512 ? 512 / largest : Math.min(1, 1600 / largest)
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Canvas недоступен")
      context.imageSmoothingEnabled = false
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const result = new BrowserQRCodeReader().decodeFromCanvas(canvas)
      if (active()) accept(result.getText())
    } catch (cause) {
      console.warn("QR image decode failed", cause)
      if (active()) setError("QR не найден на изображении. Попробуйте другое фото или введите адрес вручную.")
    } finally {
      URL.revokeObjectURL(url)
      if (active()) setImageBusy(false)
    }
  }

  return (
    <div className="wallet-qr-control">
      {!autoStart ? <button type="button" onClick={() => { const next = !open; imageEpoch.current += 1; setImageBusy(false); if (!next) stopCamera(); setOpen(next); setCamera(next); setBusy(next); setError("") }} className="t-label2 self-start rounded-[var(--radius-btn)] px-2 py-2 text-[var(--blue)] min-h-11">
        {open ? "Закрыть сканер" : "Сканировать QR"}
      </button> : null}
      {open ? <div className="wallet-qr-panel">
        <div className="wallet-qr-viewfinder" data-active={camera}>
          {camera ? <video ref={setVideoNode} autoPlay muted playsInline aria-label="Изображение с камеры для сканирования QR" className="wallet-transfer-scanner" /> : <div className="wallet-qr-placeholder"><IconScan size={36} /><p>{imageBusy ? "Читаем изображение" : /камер/i.test(error) ? "Камера недоступна" : "QR адреса получателя"}</p></div>}
        </div>
        <p className="wallet-qr-caption">{!camera ? "Выберите фото QR с адресом. Сумма из QR не подставляется." : autoStart ? "Наведите камеру на QR адреса. Сумма из QR не подставляется." : "Сканируйте адрес получателя. Сумма из QR не подставляется. Вы проверите её отдельно."}</p>
        {busy && camera ? <p role="status" className="t-body2 c-2">Открываем камеру…</p> : null}
        <div className="wallet-qr-actions">
          <button type="button" onClick={() => { stopCamera(); input.current?.click() }} disabled={imageBusy} className="wallet-qr-photo">{imageBusy ? "Читаем QR…" : "Выбрать фото с QR"}</button>
          {!camera && !busy && !imageBusy && navigator.mediaDevices ? <button type="button" onClick={() => { setError(""); setBusy(true); setCamera(true) }} className="wallet-qr-retry">Повторить сканирование</button> : null}
        </div>
        {!navigator.mediaDevices?.getUserMedia ? <p className="t-body2 c-2">Камера доступна на HTTPS или localhost. Изображение можно выбрать и здесь.</p> : null}
        {error ? <p role="alert" className="wallet-qr-error">{error}</p> : null}
        <input ref={input} type="file" accept="image/*" capture={undefined} onChange={file} className="sr-only" aria-label="Выбрать изображение с QR" />
      </div> : null}
    </div>
  )
}
