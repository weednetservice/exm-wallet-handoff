import { useEffect, useState, type FormEvent } from "react"
import { MagnifyingGlassIcon } from "@phosphor-icons/react"
import { networkLabel, type ChainFamily, type Network } from "@/lib/chains"
import { shortAddress } from "@/lib/format"
import { PersonAvatar } from "../avatars"
import { IconChevronRight, IconCopy } from "../glyph"
import { copyText, Group, PrimaryButton, Row, SecondaryButton, Sheet, useToast } from "../ui"
import { useAddressBook, type SavedAddress } from "./store"
import "./address-book.css"

const FAMILY: Record<ChainFamily, { label: string; symbol: string; networkId: string }> = {
  evm: { label: "Ethereum и EVM", symbol: "ETH", networkId: "ethereum-mainnet" },
  solana: { label: "Solana", symbol: "SOL", networkId: "solana-mainnet" },
  ton: { label: "TON", symbol: "TON", networkId: "ton-testnet" },
  bitcoin: { label: "Bitcoin", symbol: "BTC", networkId: "bitcoin-mainnet" },
}
const FAMILIES: ChainFamily[] = ["evm", "solana", "bitcoin"]

type SheetBase = { open: boolean; onOpenChange: (open: boolean) => void; initialView?: "list" | "add"; onBackFromList?: () => void }
/** For a send form, provide both `network` and `onSelect`; selection waits for explicit network confirmation. */
export type AddressBookSheetProps = SheetBase & (
  | { network: Network; onSelect: (contact: SavedAddress) => void }
  | { network?: never; onSelect?: never }
)
type View = "list" | "add" | "detail" | "confirm" | "delete" | "rename"

/** Works both as a settings address book and as the recipient picker for one selected network. */
export function AddressBookSheet({ open, onOpenChange, network, onSelect, onBackFromList, initialView = "list" }: AddressBookSheetProps) {
  const book = useAddressBook()
  const [view, setView] = useState<View>(initialView)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [name, setName] = useState("")
  const [family, setFamily] = useState<ChainFamily>(network?.family ?? "evm")
  const [address, setAddress] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [toast, showToast] = useToast()
  const selected = book.contacts.find((contact) => contact.id === selectedId)
  const contacts = network ? book.contacts.filter((contact) => contact.family === network.family) : book.contacts
  const query = search.trim().toLocaleLowerCase("ru-RU")
  const matches = query ? contacts.filter((contact) => [contact.name, contact.address, FAMILY[contact.family].label].some(
    (field) => field.toLocaleLowerCase("ru-RU").includes(query),
  )) : contacts

  useEffect(() => {
    setView(initialView)
    if (open) return
    setSelectedId(null)
    setSearch("")
    setName("")
    setAddress("")
    setError(null)
  }, [open, initialView])
  useEffect(() => {
    if (network) setFamily(network.family)
  }, [network?.family]) // eslint-disable-line react-hooks/exhaustive-deps

  const add = (event: FormEvent) => {
    event.preventDefault()
    const result = book.add({ name, family: network?.family ?? family, address })
    if (!result.ok) return setError(result.error)
    setSelectedId(result.contact.id)
    setName("")
    setAddress("")
    setError(null)
    if (onSelect) setView("confirm")
    else { setView("list"); showToast("Адрес сохранён") }
  }
  const back = () => {
    setError(null)
    setView(view === "delete" || view === "rename" ? "detail" : "list")
  }
  const beginAdd = () => {
    setName("")
    setAddress("")
    setError(null)
    setFamily(network?.family ?? "evm")
    setView("add")
  }
  const copy = async (value: string) => showToast(await copyText(value) ? "Адрес скопирован" : "Браузер не дал скопировать адрес")

  if (view === "add") return (
    <Sheet fullscreen open={open} onOpenChange={onOpenChange} title="Новый контакт" onBack={back} footer={<PrimaryButton type="submit" form="contact-add" disabled={!name.trim() || !address.trim()}>Сохранить контакт</PrimaryButton>}>
      <form id="contact-add" onSubmit={add} className="wallet-addressbook-form flex flex-col gap-5 pb-2">
        {network ? (
          <div className="card px-4 py-3"><p className="t-body2 c-2">Сеть перевода</p><p className="t-label1">{networkLabel(network)}</p></div>
        ) : (
          <fieldset className="flex flex-col gap-2">
            <legend className="t-body2 c-2 px-1 pb-2">Семейство сети</legend>
            <div className="grid grid-cols-2 gap-2">
              {FAMILIES.map((item) => <button key={item} type="button" aria-pressed={family === item} onClick={() => { setFamily(item); setError(null) }} className="t-label2 min-h-12 rounded-[var(--radius-btn)] px-3 text-left" style={{ background: family === item ? "var(--tint)" : "var(--grouped)" }}>{FAMILY[item].label}</button>)}
            </div>
          </fieldset>
        )}
        <div className="flex flex-col gap-2 px-1">
          <label htmlFor="contact-name" className="t-body2 c-2">Имя</label>
          <input id="contact-name" value={name} maxLength={40} onChange={(event) => { setName(event.target.value); setError(null) }} autoComplete="off" placeholder="Например, Алексей" className="t-body1 min-h-14 rounded-[var(--radius-btn)] bg-[var(--grouped)] px-4 text-[var(--label)]" />
        </div>
        <div className="flex flex-col gap-2 px-1">
          <label htmlFor="contact-address" className="t-body2 c-2">Публичный адрес</label>
          <textarea id="contact-address" value={address} maxLength={128} onChange={(event) => { setAddress(event.target.value); setError(null) }} autoCapitalize="off" autoCorrect="off" spellCheck={false} rows={2} placeholder={(network?.family ?? family) === "evm" ? "0x…" : (network?.family ?? family) === "bitcoin" ? "bc1…" : "Адрес"} className="t-body1 mono min-h-24 resize-none rounded-[var(--radius-btn)] bg-[var(--grouped)] p-4 text-[var(--label)]" />
        </div>
        <p className="t-body2 c-2 px-1">Сохраняется только публичный адрес. Сеть перевода проверьте перед отправкой.</p>
        {error ? <p role="alert" className="t-body2 px-1 text-[var(--red)]">{error}</p> : null}
      </form>
    </Sheet>
  )

  if (selected && view === "confirm" && network && onSelect) return (
    <Sheet fullscreen open={open} onOpenChange={onOpenChange} title="Проверьте получателя" onBack={back} footer={<PrimaryButton onClick={() => { onSelect(selected); onOpenChange(false) }}>Использовать адрес</PrimaryButton>}>
      <div className="wallet-addressbook-content">
        <div className="wallet-addressbook-person"><PersonAvatar identity={selected.id} kind="contact" size={56} /><div><p>{selected.name}</p><span>{FAMILY[selected.family].label}</span></div></div>
        <p className="t-body2 c-2 px-1">Убедитесь, что {selected.name} ждёт перевод именно в этой сети.</p>
        <Group className="wallet-addressbook-ticket">
          <Row label="Сеть">{networkLabel(network)}</Row>
          <div className="flex flex-col gap-1 px-4 py-3"><span className="t-body2 c-2">Полный адрес</span><span className="t-body2 mono break-all select-all">{selected.address}</span></div>
        </Group>
      </div>
    </Sheet>
  )

  if (selected && view === "delete") return (
    <Sheet fullscreen open={open} onOpenChange={onOpenChange} title="Удалить контакт?" onBack={back}>
      <div className="flex flex-col gap-4 pb-2">
        <p className="t-body1 c-2 px-1">«{selected.name}» исчезнет из адресной книги на этом устройстве. Монеты и сам адрес в блокчейне не изменятся.</p>
        {error ? <p role="alert" className="t-body2 px-1 text-[var(--red)]">{error}</p> : null}
        <button type="button" onClick={() => { if (book.remove(selected.id)) { setSelectedId(null); setView("list"); showToast("Контакт удалён") } else setError("Не удалось удалить контакт из хранилища браузера") }} className="t-label1 min-h-14 rounded-[var(--radius-group)] bg-[var(--grouped)] text-[var(--red)]">Удалить контакт</button>
        <SecondaryButton onClick={back}>Отмена</SecondaryButton>
      </div>
    </Sheet>
  )

  if (selected && view === "rename") return (
    <Sheet fullscreen open={open} onOpenChange={onOpenChange} title="Изменить имя" onBack={back}
      footer={<PrimaryButton type="submit" form="contact-rename" disabled={!name.trim() || name.trim() === selected.name}>Сохранить имя</PrimaryButton>}>
      <form id="contact-rename" className="wallet-addressbook-content" onSubmit={(event) => {
        event.preventDefault()
        const result = book.rename(selected.id, name)
        if (!result.ok) return setError(result.error)
        setView("detail")
        showToast("Имя сохранено")
      }}>
        <div className="wallet-addressbook-person">
          <PersonAvatar identity={selected.id} kind="contact" size={48} />
          <div><p>{selected.name}</p><span>{FAMILY[selected.family].label}</span></div>
        </div>
        <div className="wallet-field flex flex-col gap-2">
          <label htmlFor="contact-rename-name" className="t-body2">Имя контакта</label>
          <input id="contact-rename-name" className="wallet-field-surface t-body1 min-h-12 min-w-0 px-3"
            autoComplete="off" maxLength={40} value={name} onChange={(event) => { setName(event.target.value); setError(null) }}
            aria-invalid={!!error} data-invalid={!!error} aria-describedby={error ? "contact-rename-error" : undefined} />
          {error ? <p id="contact-rename-error" role="alert" className="t-body2 text-[var(--red)]">{error}</p> : null}
        </div>
        <div className="flex flex-col gap-1">
          <p className="t-body2 c-2">Публичный адрес</p>
          <p className="t-body2 mono break-all select-all">{selected.address}</p>
        </div>
      </form>
    </Sheet>
  )

  if (selected && view === "detail") return (
    <Sheet fullscreen open={open} onOpenChange={onOpenChange} title="Контакт" onBack={back}>
      <div className="wallet-addressbook-content">
        <div className="wallet-addressbook-person"><PersonAvatar identity={selected.id} kind="contact" size={56} /><div><p>{selected.name}</p><span>{FAMILY[selected.family].label}</span></div></div>
        <Group className="wallet-addressbook-ticket"><div className="flex flex-col gap-1 px-4 py-3"><span className="t-body2 c-2">Публичный адрес</span><span className="t-body2 mono break-all select-all">{selected.address}</span></div></Group>
        <SecondaryButton onClick={() => { setName(selected.name); setError(null); setView("rename") }}>Изменить имя</SecondaryButton>
        <SecondaryButton onClick={() => copy(selected.address)}><IconCopy size={20} />Скопировать адрес</SecondaryButton>
        <button type="button" onClick={() => setView("delete")} className="t-label1 min-h-12 rounded-[var(--radius-group)] text-[var(--red)]">Удалить контакт</button>
      </div>
      {toast}
    </Sheet>
  )

  return (
    <Sheet fullscreen open={open} onOpenChange={onOpenChange} title="Контакты" onBack={onBackFromList} subtitle={network ? networkLabel(network) : undefined} footer={<PrimaryButton onClick={beginAdd}>Добавить контакт</PrimaryButton>}>
      {contacts.length ? <label className="wallet-search wallet-addressbook-search">
        <MagnifyingGlassIcon size={20} weight="light" aria-hidden="true" />
        <span className="sr-only">Поиск контакта</span>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя или адрес" autoComplete="off" />
      </label> : null}
      {matches.length ? <Group className="wallet-addressbook-list">{matches.map((contact) => (
        <button key={contact.id} type="button" onClick={() => { setSelectedId(contact.id); setView(onSelect ? "confirm" : "detail") }} className="wallet-addressbook-row">
          <PersonAvatar identity={contact.id} kind="contact" size={40} />
          <span className="wallet-addressbook-row-copy"><span>{contact.name}</span><span className="mono">{shortAddress(contact.address, 7, 5)}</span>{!network ? <small>{FAMILY[contact.family].label}</small> : null}</span>
          <IconChevronRight size={18} className="c-2 shrink-0" />
        </button>
      ))}</Group> : contacts.length ? <div className="py-6"><p role="status" className="t-body2 c-2">Контакты не найдены.</p><button type="button" className="t-body2 min-h-11 text-[var(--blue)]" onClick={() => setSearch("")}>Сбросить поиск</button></div> : <div className="flex flex-col items-center gap-2 px-4 py-12 text-center"><p className="t-label1">Контактов пока нет</p><p className="t-body2 c-2">Сохраните имя и публичный адрес для следующего перевода.</p></div>}
      {toast}
    </Sheet>
  )
}
