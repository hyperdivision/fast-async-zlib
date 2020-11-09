const { workerData, parentPort } = require('worker_threads')
const zlib = require('zlib')

const { input, output, maxBatch } = workerData
const ints = maxBatch + 2

const batch = new Int32Array(input, 0, ints)
const inp = Buffer.from(input, ints * 4, input.byteLength - 4 * ints)
const out = Buffer.from(output)

while (true) {
  Atomics.wait(batch, 0, 0)

  // const method = batch[0] // only gzip support atm
  const batchEnd = batch[1] + 2

  let inOffset = 0
  let outOffset = 0

  for (let i = 2; i < batchEnd; i++) {
    const g = new zlib.Gzip()
    const chunk = inp.slice(inOffset, inOffset += batch[i])
    g._outBuffer = out.slice(outOffset)
    const res = g._processChunk(chunk, g._finishFlushFlag)
    batch[i] = res.length
    outOffset += res.length
  }

  batch[0] = 0

  parentPort.postMessage(null)
}
