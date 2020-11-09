# fast-async-zlib

Speed up zlib operations by running them using the sync APIs but in a [Worker](https://nodejs.org/api/worker_threads.html).

```
npm install fast-async-zlib
```

## Usage

Works similar to the core zlib module, except it uses a Worker to batch pending zips
which can be quite faster than using the normal `zlib.gzip(data, cb)` API.

``` js
const ZLibWorker = require('fast-async-zlib')

const z = new ZLibWorker({
  maxBatchBytes: 1024 * 1024 // how large a batch buffer should be used? (1 MB default)
})

const buf = await z.gzip('some data')
console.log('gzipped:', buf)
```

There is a small bench included that benches three approaches to zipping 100k ~1kb strings.
On my laptop it produces the following result:

```
running bench
using core sync: 3.383s
using core async: 4.640s
using worker: 2.870s
re-running bench
using core sync: 3.873s
using core async: 4.843s
using worker: 2.929s
```

Ie. `worker.gzip` is ~10% faster than `zlib.gzipSync` and ~40% faster than `zlib.gzip(data, cb)`.

## API

#### `const z = new ZLibWorker([options])`

Create a new worker instance. Will use a Worker thread in the background to run the actual gzip, using a SharedArrayBuffer to pass data back and fourth.
Options include:

```
{
  maxBatch: 512, // how many entries to max batch to the worker
  maxBatchBytes: 1MB // how much memory to use for the shared array buffer
}
```

Note that `maxBatchBytes` must be larger than largest payload you pass to `z.gzip(payload)`,
otherwise that method will throw an exception.

If this is a big problem to you, open an issue and we'll see if can make the buffer autogrow easily.

#### `const buf = await z.gzip(inp)`

Gzip a string or buffer using the worker.

#### `z.destroy()`

Fully destroy the worker. Only needed if you for some reason want to get rid of it while the program is running.

#### `const pool = ZLibWorker.pool(size, [options])`

Make a simple worker pool of the given size.
Has the same API as the `ZLibWorker` but will use `size` workers behind the scenes to spread out the load.

## Future

If you have a need for gunzip, inflate, deflate etc open an issue and we'll see about adding it.

## License

MIT
