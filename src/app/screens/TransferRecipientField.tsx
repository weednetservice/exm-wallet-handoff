import { useEffect, useState, type ComponentProps } from "react"
import { shortAddress } from "@/lib/format"
import type { SavedAddress } from "../addressBook/store"
import { PersonAvatar } from "../avatars"
import { IconClose } from "../glyph"
import { AddressField } from "./sheets"

type Props = ComponentProps<typeof AddressField> & { contact?: SavedAddress }

export function TransferRecipientField({ contact, ...field }: Props) {
  const [editing, setEditing] = useState(false)
  useEffect(() => setEditing(false), [contact?.id])

  if (!contact || editing) return <AddressField {...field} autoFocus={editing || field.autoFocus} />

  return <div className="wallet-transfer-contact">
    <button id={field.id} type="button" className="wallet-transfer-contact-identity" aria-label={`Изменить адрес получателя: ${contact.name}, ${field.value}`} aria-describedby={field.describedBy} onClick={() => setEditing(true)}>
      <PersonAvatar identity={contact.id} kind="contact" size={36} />
      <span className="wallet-transfer-contact-copy"><span>{contact.name}</span><span className="mono">{shortAddress(field.value, 7, 5)}</span></span>
    </button>
    <button type="button" className="wallet-transfer-contact-remove" aria-label="Убрать получателя" onClick={() => { field.onChange(""); requestAnimationFrame(() => document.getElementById(field.id)?.focus()) }}><IconClose size={18} /></button>
  </div>
}
