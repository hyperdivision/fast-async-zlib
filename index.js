const { Worker } = require('worker_threads')
const path = require('path')

const GZIP_OVERHEAD = 30

class WorkerPool {
  constructor (size, opts) {
    this.workers = new Array(size)
    this.tick = 0

    for (let i = 0; i < this.workers.length; i++) {
      this.workers[i] = new ZlibWorker(opts)
    }
  }

  gzip (inp) {
    return this.next().gzip(inp)
  }

  next () {
    if (this.tick === this.workers.length - 1) this.tick = 0
    else this.tick++
    return this.workers[this.tick]
  }

  destroy () {
    for (const w of this.workers) w.destroy()
  }
}

class ZlibWorker {
  constructor (opts = {}) {
    const maxBatch = opts.maxBatch || 512
    const maxBatchBytes = opts.maxBatchBytes || 1024 * 1024
    const ints = maxBatch + 2

    this.destroyed = false

    this._maxBytes = maxBatchBytes
    this._maxBatch = maxBatch
    this._input = new SharedArrayBuffer(ints * 4 + maxBatchBytes)
    this._output = new SharedArrayBuffer(ints * 4 + (GZIP_OVERHEAD * maxBatch) + maxBatchBytes)
    this._batch = new Int32Array(this._input, 0, ints)
    this._inputData = Buffer.from(this._input, ints * 4)
    this._outputData = Buffer.from(this._output)

    this._worker = new Worker(path.join(__dirname, './worker.js'), {
      workerData: {
        input: this._input,
        output: this._output,
        maxBatch
      }
    })

    this._pending = null
    this._size = 0
    this._batches = []
    this._freeSpace = 0
    this._freeEntries = 0
    this._runQueued = false

    this._worker.on('message', () => { // batch done, signal message
      this._runQueued = false

      let offset = 0

      for (let i = 0; i < this._pending.length; i++) {
        const b = this._outputData.slice(offset, offset += this._batch[i + 2])
        this._pending[i][1](Buffer.from(b))
      }

      this._pending = null

      if (this._batches.length && !this._runQueued) {
        this._runQueued = true
        this._run()
      } else {
        this._maybeUnref()
      }
    })

    this._worker.on('online', () => this._maybeUnref())
  }

  _maybeUnref () {
    if (!this._pending && !this._batches.length) this._worker.unref()
  }

  get queued () {
    let queued = 0
    for (const b of this._batches) queued += b.length
    return queued
  }

  gzip (inp) {
    let resolve
    let reject

    return new Promise((res, rej) => {
      resolve = res
      reject = rej

      const len = inp.length

      if (this.destroyed) {
        return reject(new Error('Worker is destroyed'))
      }
      if (len >= this._maxBytes) {
        return reject(new Error('Input does not fit in buffer. Increase maxBatchBytes'))
      }

      if (this._freeSpace - len < 0 || !this._freeEntries) {
        this._freeEntries = this._maxBatch
        this._freeSpace = this._maxBytes
        this._batches.push([])
        this._worker.ref()
      }

      this._batches[this._batches.length - 1].push([inp, resolve, reject])
      this._freeSpace -= len
      this._freeEntries--

      if (!this._runQueued) {
        this._runQueued = true
        process.nextTick(run, this)
      }
    })
  }

  _run () {
    if (this.destroyed) return

    const inputs = this._pending = this._batches.shift()

    this._freeSpace = this._freeEntries = 0

    let offset = 0
    let i = 2

    for (const [b] of inputs) {
      if (typeof b === 'string') {
        const len = this._inputData.write(b, offset)
        offset += len
        this._batch[i++] = len
      } else {
        b.copy(this._inputData, offset)
        offset += b.length
        this._batch[i++] = b.length
      }
    }
    this._batch[0] = 1 // gzip
    this._batch[1] = inputs.length
    Atomics.notify(this._batch, 0, 1)
  }

  destroy () {
    if (this.destroyed) return
    this.destroyed = true

    this._worker.terminate()
    if (this._pending) rejectAll(this._pending, new Error('Worker is destroyed'))
    for (const b of this._batches) rejectAll(b, new Error('Worker is destroyed'))
  }

  static pool (size, opts) {
    return new WorkerPool(size, opts)
  }
}

module.exports = ZlibWorker

function rejectAll (batch, err) {
  for (const [inp, resolve, reject] of batch) {
    reject(err)
  }
}

function run (self) {
  self._run()
}
