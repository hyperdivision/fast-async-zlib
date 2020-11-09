const zlib = require('zlib')
const ZW = require('./')

const b = require('crypto').randomBytes(800).toString('base64')

const strings = new Array(100000)
for (let i = 0; i < strings.length; i++) strings[i] = b

start()

async function start () {
  console.log('running bench')
  await sync()
  await async()
  await worker()
  console.log('re-running bench')
  await sync()
  await async()
  await worker()
}

function worker () {
  return new Promise(resolve => {
    const pending = strings.slice(0)
    let missing = pending.length

    console.time('using worker')
    const pool = ZW.pool(3)

    let max = pending.length

    while (pending.length && max-- > 0) {
      pool.gzip(pending.pop()).then(ondone)
    }

    function ondone (out) {
      missing--
      if (pending.length) return pool.gzip(pending.pop()).then(ondone)
      if (!missing) {
        console.timeEnd('using worker')
        pool.destroy()
        resolve()
      }
    }
  })
}

// sync
function sync () {
  const pending = strings.slice(0)
  console.time('using core sync')
  while (pending.length) {
    zlib.gzipSync(pending.pop())
  }
  console.timeEnd('using core sync')
}

// async
function async () {
  return new Promise(resolve => {
    const pending = strings.slice(0)
    let missing = pending.length
    console.time('using core async')
    for (let i = 0; i < 20; i++) {
      work()
    }

    function work () {
      const next = pending.pop()
      zlib.gzip(next, ondone)
    }

    function ondone (_, data) {
      missing--
      if (pending.length) return work()
      if (!missing) {
        console.timeEnd('using core async')
        resolve()
      }
    }
  })
}
