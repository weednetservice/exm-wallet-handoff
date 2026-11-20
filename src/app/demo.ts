/** Legacy denylist: old saved demo addresses must not become mainnet deposit accounts. */
import type { AccountMap } from "./accounts"

/** Retained for migration protection and archived prototypes; no production entry can select them. */
export const DEMO_ADDRESSES = [
  "0x4D2EfE2b53379761EDAa59Fe2ccd8f2E46943Af9",
  "BXyBvaSgBTRQQoDR2mGFgCv1zrezzdewwExoiFwEubGx",
  "0QAbTCvK1moonUn047m4Uuk3kOWW_gcyAQ_zenxeEwc83nYH",
  "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl",
]

export function isLegacyDemoAddress(address: string) {
  return DEMO_ADDRESSES.some((legacy) => address.startsWith("0x") ? legacy.toLowerCase() === address.toLowerCase() : legacy === address)
}

/** every shown address is a demo one */
export function isDemo(accounts: AccountMap) {
  const list = Object.values(accounts).filter(Boolean) as { address: string }[]
  return list.length > 0 && list.every((a) => DEMO_ADDRESSES.includes(a.address))
}
