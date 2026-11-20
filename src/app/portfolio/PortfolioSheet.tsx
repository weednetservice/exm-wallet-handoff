import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type Ref } from "react"
import { formatCoin, shortAddress } from "@/lib/format"
import { IconChevronDown, IconCopy } from "../glyph"
import { copyText, ErrorNote, IconButton, PrimaryButton, SecondaryButton, Sheet } from "../ui"
import {
  checkPortfolioAsset,
  PortfolioPending,
  portfolioAssetKey,
  portfolioCapabilities,
  portfolioError,
  scanPortfolio,
  validPortfolioContract,
  type PortfolioAsset,
  type PortfolioFamily,
  type PortfolioNetwork,
  type PortfolioPage,
} from "./api"
import "./portfolio.css"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: Partial<Record<PortfolioFamily, { address: string }>>
  balancesHidden: boolean
}

type RequestState<Result> = {
  phase: "idle" | "loading" | "ready" | "pending" | "error"
  data: Result | null
  error?: string
}

const familyNames = { evm: "Ethereum и EVM-сети", solana: "Solana" }

function useRequest<Result>() {
  const pending = useRef<AbortController | null>(null)
  const [state, setState] = useState<RequestState<Result>>({ phase: "idle", data: null })
  const abort = useCallback(() => {
    pending.current?.abort()
    pending.current = null
  }, [])
  useEffect(() => abort, [abort])

  const reset = useCallback(() => {
    abort()
    setState({ phase: "idle", data: null })
  }, [abort])

  const run = useCallback(async (load: (signal: AbortSignal) => Promise<Result>, keepData = false) => {
    if (pending.current) return
    const controller = new AbortController()
    pending.current = controller
    setState((current) => ({ phase: "loading", data: keepData ? current.data : null }))

    try {
      const data = await load(controller.signal)
      if (!controller.signal.aborted) setState({ phase: "ready", data })
    } catch (error) {
      if (!controller.signal.aborted) setState((current) => ({
        phase: error instanceof PortfolioPending ? "pending" : "error",
        data: current.data,
        error: portfolioError(error),
      }))
    } finally {
      if (pending.current === controller) pending.current = null
    }
  }, [])

  return { ...state, run, reset }
}

function CopyAddress({ address, label }: { address: string; label: string }) {
  const value = useRef<HTMLElement>(null)
  const [message, setMessage] = useState("")

  const copy = async () => {
    const copied = await copyText(address)
    const element = value.current
    if (!element || !element.isConnected || element.textContent !== address) return
    if (copied) {
      setMessage("Скопировано")
      return
    }
    const selection = window.getSelection()
    selection?.selectAllChildren(element)
    setMessage(selection?.toString() === address ? "Адрес выделен для копирования" : "Выделите адрес вручную")
  }

  return <div className="wallet-portfolio-copy">
    <code ref={value} dir="ltr">{address}</code>
    <IconButton label={label} onClick={copy}><IconCopy size={18} /></IconButton>
    <p className="wallet-portfolio-status" role="status">{message}</p>
  </div>
}

function assetTitle(asset: PortfolioAsset) {
  return asset.name || asset.symbol || (asset.contract ? "Токен" : "Нативная монета")
}

function AssetAmount({ asset, hidden }: { asset: PortfolioAsset; hidden: boolean }) {
  if (hidden) return <span className="wallet-portfolio-amount"><span className="sr-only">Остаток скрыт</span><span aria-hidden="true">••••</span></span>
  return <span className="wallet-portfolio-amount">
    <span>{asset.decimals === null ? new Intl.NumberFormat("ru-RU").format(BigInt(asset.amount)) : formatCoin(BigInt(asset.amount), asset.decimals, "", asset.decimals).trim()}</span>
    {asset.decimals === null ? <small>мин. единиц</small> : null}
  </span>
}

function CheckedAsset({ asset, hidden, showContract = true }: { asset: PortfolioAsset; hidden: boolean; showContract?: boolean }) {
  return <div className="wallet-portfolio-checked">
    <div className="wallet-portfolio-checked-head">
      <div>
        <strong><bdi>{assetTitle(asset)}</bdi></strong>
        <p className="wallet-portfolio-status">{asset.chain}{asset.symbol && asset.symbol !== assetTitle(asset) ? <> · <bdi>{asset.symbol}</bdi></> : null}</p>
      </div>
      <AssetAmount asset={asset} hidden={hidden} />
    </div>
    {showContract && asset.contract ? <CopyAddress key={asset.contract} address={asset.contract} label="Скопировать контракт или mint" /> : null}
    <p className="wallet-portfolio-status">Остаток прочитан в сети</p>
  </div>
}

function ManualCheck({ networks, family, address, hidden }: {
  networks: PortfolioNetwork[]
  family: PortfolioFamily
  address: string
  hidden: boolean
}) {
  const labels = useId()
  const [networkId, setNetworkId] = useState("")
  const [contractInput, setContractInput] = useState("")
  const [invalid, setInvalid] = useState(false)
  const contractField = useRef<HTMLInputElement>(null)
  const check = useRequest<PortfolioAsset>()
  const network = networks.find((item) => item.id === networkId) ?? networks[0]
  const contract = contractInput.trim()
  const busy = check.phase === "loading"

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!network || busy) return
    if (contract && !validPortfolioContract(family, contract)) {
      setInvalid(true)
      contractField.current?.focus()
      return
    }
    void check.run((signal) => checkPortfolioAsset(network, address, contract || null, signal))
  }

  if (!network) return null
  return <details className="wallet-portfolio-manual">
    <summary>Проверить отдельный актив<IconChevronDown size={18} aria-hidden /></summary>
    <form onSubmit={submit} className="wallet-portfolio-form">
      <label htmlFor={labels + "-network"}>Сеть</label>
      <select id={labels + "-network"} className="wallet-field-surface" value={network.id} onChange={(event) => {
        setNetworkId(event.target.value)
        setInvalid(false)
        check.reset()
      }}>
        {networks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <label htmlFor={labels + "-contract"}>Контракт или mint</label>
      <input
        id={labels + "-contract"}
        ref={contractField}
        className="wallet-field-surface"
        value={contractInput}
        onChange={(event) => {
          setContractInput(event.target.value)
          setInvalid(false)
          check.reset()
        }}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        aria-describedby={labels + "-hint"}
      />
      <p id={labels + "-hint"} className="wallet-portfolio-status" aria-live="polite">
        {invalid ? <span data-portfolio-error>Введите адрес токена для выбранной сети.</span> : "Оставьте поле пустым для проверки нативной монеты."}
      </p>
      <p id={labels + "-rpc"} className="wallet-portfolio-status">Публичный адрес передаётся RPC выбранной сети.</p>
      <SecondaryButton type="submit" aria-disabled={busy} aria-describedby={labels + "-rpc"}>Проверить остаток</SecondaryButton>
      {busy ? <p role="status" className="wallet-portfolio-status">Читаем остаток в сети…</p> : null}
      {check.error ? <ErrorNote message={check.error} /> : null}
      {check.data ? <CheckedAsset asset={check.data} hidden={hidden} /> : null}
    </form>
  </details>
}

function AssetRow({ asset, network, address, hidden }: {
  asset: PortfolioAsset
  network?: PortfolioNetwork
  address: string
  hidden: boolean
}) {
  const check = useRequest<PortfolioAsset>()
  const busy = check.phase === "loading"

  return <li className="wallet-portfolio-row">
    <details>
      <summary>
        <span className="wallet-portfolio-identity">
          <strong><bdi>{assetTitle(asset)}</bdi></strong>
          <small>{asset.symbol && asset.symbol !== assetTitle(asset) ? <><bdi>{asset.symbol}</bdi> · </> : null}
            {asset.contract ? <bdi className="wallet-portfolio-fingerprint" dir="ltr">{shortAddress(asset.contract)}</bdi> : "Нативная монета"}
          </small>
          {asset.spam ? <small>Индексатор пометил как спам</small> : null}
        </span>
        <AssetAmount asset={asset} hidden={hidden} />
        <IconChevronDown size={17} aria-hidden />
      </summary>
      <div className="wallet-portfolio-details">
        {asset.contract ? <CopyAddress address={asset.contract} label="Скопировать контракт или mint" /> : null}
        {network ? <SecondaryButton className="wallet-portfolio-direct" aria-disabled={busy} onClick={() => {
          void check.run((signal) => checkPortfolioAsset(network, address, asset.contract, signal))
        }}>Проверить в сети</SecondaryButton> : <p className="wallet-portfolio-status">Для этой сети доступен остаток из индексатора.</p>}
        {busy ? <p role="status" className="wallet-portfolio-status">Читаем остаток в сети…</p> : null}
        {check.error ? <ErrorNote message={check.error} /> : null}
        {check.data ? <CheckedAsset asset={check.data} hidden={hidden} showContract={false} /> : null}
      </div>
    </details>
  </li>
}

function scanSummary(page: PortfolioPage, assets: PortfolioAsset[]) {
  if (assets.length) return `Найдено активов — ${assets.length}`
  if (page.partial) return "Положительные остатки пока не получены."
  if (page.cursor) return "На загруженной странице нет активов с положительным остатком."
  return "Активов с положительным остатком в ответе нет."
}

function ScanResults({ scan, networks, address, hidden, onMore }: {
  scan: RequestState<PortfolioPage>
  networks: PortfolioNetwork[]
  address: string
  hidden: boolean
  onMore: () => void
}) {
  const [search, setSearch] = useState("")
  const query = search.trim().toLocaleLowerCase("ru")
  const page = scan.data
  const networkById = new Map(networks.map((network) => [network.id, network]))
  const assets = page?.assets ?? []
  const groups = new Map<string, { name: string; rows: PortfolioAsset[] }>()
  for (const asset of assets) {
    if (query && ![assetTitle(asset), asset.symbol, asset.chain, asset.contract].some((value) => value?.toLocaleLowerCase("ru").includes(query))) continue
    const group = groups.get(asset.network)
    if (group) group.rows.push(asset)
    else groups.set(asset.network, { name: asset.chain, rows: [asset] })
  }

  return <section className="wallet-portfolio-results" aria-label="Найденные активы">
    <header>
      <h2>Найденные активы</h2>
      {page ? <p className="wallet-portfolio-status">{page.source === "zerion" ? "Данные индексатора Zerion" : "Данные RPC сетей"}</p> : null}
    </header>
    <p className="wallet-portfolio-status" role="status">
      {scan.phase === "loading" ? "Запрашиваем остатки…" : scan.phase === "pending" ? scan.error : page ? scanSummary(page, assets) : ""}
    </p>
    {scan.phase === "error" && scan.error ? <ErrorNote message={scan.error} /> : null}
    {scan.phase === "idle" ? <p className="wallet-portfolio-empty">Запустите поиск, чтобы увидеть активы по этому адресу.</p> : null}
    {page?.partial ? <p className="wallet-portfolio-partial" role="status">
      Данные неполные.{page.unavailable?.length ? ` Сети без ответа — ${page.unavailable.map((id) => networkById.get(id)?.name ?? id).join(", ")}.` : ""}
    </p> : null}
    {assets.length > 0 ? <label className="wallet-portfolio-search">
      <span className="sr-only">Поиск по загруженным активам</span>
      <input type="search" className="wallet-field-surface" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Актив, сеть или контракт" />
    </label> : null}
    {query && assets.length > 0 && groups.size === 0 ? <p className="wallet-portfolio-status" role="status">Среди загруженных активов совпадений нет.</p> : null}
    {[...groups].map(([id, group]) => <section className="wallet-portfolio-network" key={id}>
      <h3>{group.name}</h3>
      <ul>{group.rows.map((asset) => <AssetRow asset={asset} key={portfolioAssetKey(asset)} network={networkById.get(id)} address={address} hidden={hidden} />)}</ul>
    </section>)}
    {page?.cursor ? <SecondaryButton aria-disabled={scan.phase === "loading"} onClick={onMore}>Загрузить ещё</SecondaryButton> : null}
  </section>
}

function AccountPortfolio({ accounts, family, onFamilyChange, familyControl, address, balancesHidden }: {
  accounts: Props["accounts"]
  family: PortfolioFamily
  onFamilyChange: (family: PortfolioFamily) => void
  familyControl: Ref<HTMLSelectElement>
  address: string
  balancesHidden: boolean
}) {
  const labels = useId()
  const capabilities = useRequest<Awaited<ReturnType<typeof portfolioCapabilities>>>()
  const { run: loadCapabilities } = capabilities
  useEffect(() => { void loadCapabilities(portfolioCapabilities) }, [loadCapabilities])

  const scan = useRequest<PortfolioPage>()
  const start = (more = false) => {
    const current = more ? scan.data : null
    void scan.run(async (signal) => {
      const next = await scanPortfolio(address, family, current?.cursor ?? undefined, signal)
      if (current && (current.source !== next.source || next.cursor && current.cursor === next.cursor)) {
        throw new Error("Источник не вернул следующую страницу. Запустите поиск заново.")
      }
      const assets = new Map((current?.assets ?? []).map((asset) => [portfolioAssetKey(asset), asset]))
      for (const asset of next.assets) assets.set(portfolioAssetKey(asset), asset)
      return {
        ...next,
        assets: [...assets.values()],
        partial: Boolean(current?.partial || next.partial),
        unavailable: [...new Set([...(current?.unavailable ?? []), ...(next.unavailable ?? [])])],
      }
    }, more)
  }

  const networks = capabilities.data?.networks.filter((network) => network.family === family) ?? []
  const scanHint = family === "evm"
    ? capabilities.data?.indexer === "zerion"
      ? "Для поиска нативных монет и токенов публичный адрес передаётся индексатору Zerion."
      : "Публичный адрес передаётся RPC сетей. Поиск показывает нативные монеты. Токен можно проверить по контракту."
    : "Публичный адрес передаётся RPC Solana для проверки SOL и токенов SPL."
  return <div className="wallet-portfolio-layout">
    <section className="wallet-portfolio-controls" aria-label="Адрес и параметры проверки">
      <div className="wallet-portfolio-account">
        <strong>Только просмотр</strong>
        {accounts.evm?.address && accounts.solana?.address ? <label htmlFor={labels + "-account"}>Семейство сетей</label> : <p className="wallet-portfolio-status">{familyNames[family]}</p>}
        {accounts.evm?.address && accounts.solana?.address ? <select
          id={labels + "-account"}
          ref={familyControl}
          className="wallet-field-surface"
          value={family}
          onChange={(event) => onFamilyChange(event.target.value === "solana" ? "solana" : "evm")}
        >
          <option value="evm">{familyNames.evm}</option>
          <option value="solana">{familyNames.solana}</option>
        </select> : null}
        <CopyAddress address={address} label="Скопировать публичный адрес" />
      </div>
      {capabilities.error ? <ErrorNote message={capabilities.error} onRetry={() => void loadCapabilities(portfolioCapabilities)} /> : null}
      {!capabilities.data && !capabilities.error ? <p role="status" className="wallet-portfolio-status">Загружаем список сетей…</p> : null}
      {capabilities.data ? <>
        <div className="wallet-portfolio-scan">
          <p id={labels + "-privacy"} className="wallet-portfolio-status">{scanHint}</p>
          <PrimaryButton aria-disabled={scan.phase === "loading"} aria-describedby={labels + "-privacy"} onClick={() => start()}>
            {scan.data ? "Проверить заново" : "Проверить активы"}
          </PrimaryButton>
        </div>
        <ManualCheck networks={networks} address={address} family={family} hidden={balancesHidden} />
      </> : null}
    </section>
    <ScanResults scan={scan} networks={networks} address={address} hidden={balancesHidden} onMore={() => start(true)} />
  </div>
}

export function PortfolioSheet({ open, onOpenChange, accounts, balancesHidden }: Props) {
  const [preferredFamily, setPreferredFamily] = useState<PortfolioFamily>("evm")
  const familyControl = useRef<HTMLSelectElement>(null)
  const restoreFamilyControl = useRef(false)
  const family: PortfolioFamily = accounts[preferredFamily]?.address ? preferredFamily : preferredFamily === "evm" ? "solana" : "evm"
  const address = accounts[family]?.address
  useLayoutEffect(() => {
    if (!restoreFamilyControl.current) return
    restoreFamilyControl.current = false
    familyControl.current?.focus({ preventScroll: true })
  }, [family])

  return <Sheet
    open={open}
    onOpenChange={onOpenChange}
    title="Активы по сетям"
    className="wallet-portfolio-sheet"
    fullscreen
    returnFocusLabel="Активы по сетям"
  >
    {open && (address ? <AccountPortfolio
      key={`${family}:${address}`}
      accounts={accounts}
      family={family}
      onFamilyChange={(next) => {
        if (next === family) return
        restoreFamilyControl.current = true
        setPreferredFamily(next)
      }}
      familyControl={familyControl}
      address={address}
      balancesHidden={balancesHidden}
    /> : <p className="wallet-portfolio-empty">Добавьте публичный адрес Ethereum или Solana, чтобы искать активы по сетям.</p>)}
  </Sheet>
}
