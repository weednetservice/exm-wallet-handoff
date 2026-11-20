# Ethereum Uniswap deployment identity

`ethereum.ts` is generated from pinned official npm artifacts by `scripts/generate-mainnet-deployment-identity.mjs`. Its expected runtime hashes are **not** snapshots copied from an RPC response. The artifact JSON SHA-256 digests, package versions and paths are included in the manifest; a changed artifact fails generation.

## Provenance and constructor values

The [official Ethereum deployment registry](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments) identifies Router02 `0x68b3…Fc45`, QuoterV2 `0x61fF…B21e`, Factory `0x1F98…F984`, WETH9 and NonfungiblePositionManager. The complete addresses are in the manifest. The npm packages are `@uniswap/swap-router-contracts@1.1.0`, `@uniswap/v3-periphery@1.4.4` and `@uniswap/v3-core@1.0.0`; the generator uses the specific Router02, QuoterV2, Factory and Pool artifact paths, not an ABI-only package.

The published package metadata identifies source git heads `8fe4f086cee7c08f0bdb6ebe20c9ab615921c65f` (router), `697c2474757ea89fec12a4e6db16a574fe259610` (periphery), and `e3589b192d0be27e100cd0daaf6c97204fdb1899` (core). The [Router02 constructor](https://github.com/Uniswap/swap-router-contracts/blob/8fe4f086cee7c08f0bdb6ebe20c9ab615921c65f/contracts/SwapRouter02.sol) accepts v2 factory, v3 factory, position manager and WETH9. [QuoterV2](https://github.com/Uniswap/v3-periphery/blob/697c2474757ea89fec12a4e6db16a574fe259610/contracts/lens/QuoterV2.sol) accepts v3 factory and WETH9. [Pool's constructor](https://github.com/Uniswap/v3-core/blob/e3589b192d0be27e100cd0daaf6c97204fdb1899/contracts/UniswapV3Pool.sol) obtains factory, ordered token addresses, fee and tick spacing from its deployer, and computes `maxLiquidityPerTick`. [NoDelegateCall](https://github.com/Uniswap/v3-core/blob/e3589b192d0be27e100cd0daaf6c97204fdb1899/contracts/NoDelegateCall.sol) embeds its own address. These immutable values make the unfilled artifact's `deployedBytecode` unsuitable as a whole-runtime identity hash.

Generation executes the official **creation bytecode** at the canonical address inside `eth_call` with temporary code overrides on a clean local Anvil, chain 1. A temporary, nondeployed parameter-return fixture supplies the pool constructor arguments. The call returns runtime code with real constructor-computed immutables, including `address(this)`; code before and after is checked unchanged. No manually maintained immutable byte offsets are used. No deployment, signature or broadcast occurs. The constructor RPC wrapper permits only verified loopback Anvil, refuses write methods and HTTP redirects, and is never imported by production.

Pool addresses use sorted `(token0, token1, fee)`, the official factory, and the keccak of the pinned Pool creation bytecode, following [Uniswap PoolAddress](https://github.com/Uniswap/v3-periphery/blob/main/contracts/libraries/PoolAddress.sol) and [EIP-1014](https://eips.ethereum.org/EIPS/eip-1014). The resulting initcode hash is `0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54`, also published in [the official SDK constants](https://github.com/Uniswap/v3-sdk/blob/main/src/constants.ts). That source maps fee tiers 100/500/3000/10000 to spacings 1/10/60/200. The manifest covers USDC/WETH and DAI/WETH at those tiers; the runtime also checks the factory's actual spacing and `getPool` result.

## Runtime enforcement

`assertMainnetDeploymentIdentity` runs in both approval and execution paths before signature preparation. It independently checks chain 1 and obtains a fresh block number with cache disabled, then pins all code and getter reads to that number. It validates the complete runtime length and keccak of Router02, QuoterV2, Factory and **only the selected pool**, their immutable relationships, CREATE2 address, factory mapping, pool tokens, fee, spacing and maximum liquidity. Missing code, unsupported route, transport error or mismatch aborts; successful checks are not cached. Read semantics follow [Ethereum JSON-RPC](https://ethereum.org/developers/docs/apis/json-rpc/).

This gate is Ethereum-specific. [Base has a separate deployment registry](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments); a Base balance does not make this executor eligible. Contract identity does not establish price fairness. Independent feed freshness and deviation belong to the separate oracle gate; [Chainlink documents `latestRoundData` timestamps](https://docs.chain.link/data-feeds/api-reference) for that purpose. A fully dishonest RPC can fabricate both code and calls: this is a fail-closed deployment/configuration check within the existing RPC trust boundary, not an authenticated state proof. It does not attest token proxy implementations, guarantee execution success or establish finality.

## Reproduce and evidence (19 November 2026)

Start a clean constructor node in one terminal:

```sh
anvil --host 127.0.0.1 --port 18546 --chain-id 1 --silent
```

Then check the committed manifest and run the mock/constructor tests:

```sh
node scripts/generate-mainnet-deployment-identity.mjs
node scripts/mainnet-deployment-identity-smoke.mjs
```

`--write` regenerates the manifest intentionally. The artifact cache defaults to `/tmp/exm-deployment-identity`; missing tarballs are obtained using `npm pack --ignore-scripts`, then the exact extracted artifact bytes are verified. `EXM_CONSTRUCTOR_RPC` and `EXM_UNISWAP_ARTIFACT_CACHE` override those locations.

For a separate canonical read-only fork, use another terminal:

```sh
anvil --fork-url https://rpc.flashbots.net --host 127.0.0.1 --port 18547 --silent
EXM_FORK_RPC=http://127.0.0.1:18547 node scripts/mainnet-deployment-identity-smoke.mjs --fork
```

Observed: **76 constructor/mock checks passed**, including 16 route orientations, same-length code mutations, missing code, wrong immutable/getPool/spacing values, wrong chain, unsupported routes and transport failures. Repeated calls fetch a fresh block, and read only the selected pool. **Eight canonical fork pools passed at block 26445018**, with 161 allowlisted RPC reads; no state override on the canonical fork, signatures or broadcast. `npm run typecheck` and the closed `test:mainnet-swap-firewall` passed. The production signing flag remained false throughout.

The initial older PublicNode fork at block 26437946 could not read an uncached pool: upstream returned HTTP 403 requiring archive access. That run failed and is not counted as evidence; a separate latest Flashbots fork provided the completed check. Historical fork-write scenarios were not rerun or enabled for this gate.
