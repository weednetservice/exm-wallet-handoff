/** @ton/core expects Node's Buffer; the browser gets the `buffer` package */
import { Buffer } from "buffer"

const g = globalThis as unknown as { Buffer?: typeof Buffer }
if (!g.Buffer) g.Buffer = Buffer
