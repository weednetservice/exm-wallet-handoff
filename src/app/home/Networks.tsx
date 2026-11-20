import { canBroadcastFromNetwork, useNetworkSettings } from "@/lib/chains"
import { NetworkMark } from "../marks"
import { Group, Sheet } from "../ui"
import "./settings-view.css"

export function NetworksSheet({ open, onOpenChange, onBack }: { open: boolean; onOpenChange: (open: boolean) => void; onBack: () => void }) {
  const settings = useNetworkSettings()
  return (
    <Sheet open={open} onOpenChange={onOpenChange} fullscreen title="Сети" onBack={onBack}>
      <div className="wallet-networks-content flex flex-col gap-5 pb-2">
        <p id="wallet-networks-hint" className="t-body2 c-2 px-1">На главной и в истории видны включённые сети. Оставьте хотя бы одну.</p>
        <Group header="Основные сети" className="wallet-networks-list">
          {settings.all.map((network) => {
            const enabled = settings.isEnabled(network.id)
            const last = enabled && settings.enabled.length === 1
            return (
              <div key={network.id} className="wallet-network-row wallet-settings-network-row flex min-h-[64px] items-center gap-3 px-4 py-2">
                <span className="wallet-network-mark shrink-0"><NetworkMark networkId={network.id} size={32} /></span>
                <span className="wallet-network-copy min-w-0 flex-1"><span className="t-label1 block break-words">{network.name}</span><span className="t-body3 c-2 block break-words">Mainnet{network.chainId ? ` · ${network.chainId}` : ""}</span>{!canBroadcastFromNetwork(network) ? <span className="t-body3 c-2 block break-words">Получение и просмотр</span> : null}</span>
                <label className="wallet-network-toggle relative inline-flex shrink-0 items-center justify-center">
                  <input type="checkbox" checked={enabled} disabled={last} onChange={(event) => settings.setEnabled(network.id, event.target.checked)} aria-label={`${enabled ? "Выключить" : "Включить"} ${network.name} Mainnet`} aria-describedby={last ? "wallet-networks-hint" : undefined} className="peer sr-only" />
                  <span aria-hidden="true" className="wallet-network-track rounded-full"><span className="wallet-network-knob block rounded-full bg-white" /></span>
                </label>
              </div>
            )
          })}
        </Group>
      </div>
    </Sheet>
  )
}
