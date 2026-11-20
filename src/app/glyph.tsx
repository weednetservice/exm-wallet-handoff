/**
 * The one place screens take their UI icons from: the app's own drawn set (src/app/icons,
 * src/app/art; licenses/ICONS.md), under the names the screens use.
 */
import { IconChart, IconChevron, IconClose, IconSettings, IconWallet, type IconProps } from "./icons"
import { SuccessMark } from "./art/SuccessMark"

export type GlyphProps = IconProps

export {
  IconBack,
  IconCheck,
  IconClose,
  IconCopy,
  IconExternal,
  IconEye,
  IconEyeOff,
  IconBell,
  IconStar,
  IconHistory,
  IconPaste,
  IconPlus,
  IconPending,
  IconReceive,
  IconSend,
  IconScan,
  IconSettings,
  IconShare,
  IconSwap,
  IconWallet,
  IconWarning,
} from "./icons"

export const IconMarket = IconChart
export const IconChevronRight = (p: IconProps) => <IconChevron dir="right" {...p} />
export const IconChevronDown = (p: IconProps) => <IconChevron dir="down" {...p} />
/** a failed operation: the close mark, shown in red by the row */
export const IconFailed = IconClose
/** a contract call that is not a transfer or a swap: the neutral gear of the set */
export const IconContract = IconSettings
/** a transfer to one's own address: the coins stay in the wallet */
export const IconSelf = IconWallet

/** a finished send or swap: the only green on that screen */
export function SuccessArt({ label }: { label?: string }) {
  return <SuccessMark size={96} play label={label} />
}
