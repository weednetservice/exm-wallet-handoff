import { useEffect, useState } from "react"
import { PushPin } from "@phosphor-icons/react"
import { assetName } from "../assetNames"
import { CoinIcon } from "../marks"
import { ErrorNote, Group, PrimaryButton, Sheet } from "../ui"
import type { CoinGroup } from "./CoinGroups"

const PIN_KEY = "exm.home.pinned-assets.v1"

function readPins(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PIN_KEY) ?? "[]")
    if (!Array.isArray(value)) return []
    return [...new Set(value.filter((item): item is string => typeof item === "string" && /^[A-Z0-9]{1,24}$/.test(item)))]
  } catch {
    return []
  }
}

export function useAssetPins() {
  const [pins, setPins] = useState(readPins)
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === PIN_KEY || event.key === null) setPins(readPins())
    }
    window.addEventListener("storage", sync)
    return () => window.removeEventListener("storage", sync)
  }, [])

  const setPinned = (symbol: string, pinned: boolean) => {
    const next = new Set(readPins())
    if (pinned) next.add(symbol)
    else next.delete(symbol)
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify([...next]))
    } catch {
      return false
    }
    setPins([...next])
    return true
  }
  return { pins, setPinned }
}

export function AssetPinsSheet({ open, onOpenChange, groups, pins, setPinned }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groups: CoinGroup[]
  pins: string[]
  setPinned: (symbol: string, pinned: boolean) => boolean
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { if (!open) setFailed(false) }, [open])
  return <Sheet open={open} onOpenChange={onOpenChange} title="Закрепить активы" returnFocusLabel="Закрепить"
    footer={<PrimaryButton onClick={() => onOpenChange(false)}>Готово</PrimaryButton>}>
    <p className="t-body2 c-2 mb-3">Вверху списка, даже при нулевом остатке.</p>
    {failed ? <div className="mb-3"><ErrorNote message="Браузер не сохранил изменение. Попробуйте ещё раз." /></div> : null}
    <Group className="exm-home-pin-options">
      {groups.map(({ symbol }) => {
        const pinned = pins.includes(symbol)
        return <button key={symbol} type="button" aria-pressed={pinned}
          onClick={() => setFailed(!setPinned(symbol, !pinned))}>
          <CoinIcon symbol={symbol} size={36} />
          <span className="exm-home-pin-name"><span>{assetName(symbol)}</span><small>{symbol}</small></span>
          <PushPin size={20} weight={pinned ? "fill" : "regular"} aria-hidden="true" />
        </button>
      })}
    </Group>
  </Sheet>
}
