const ZLib = require('./')
const z = new ZLib()

main()

async function main () {
  const a = z.gzip('a')
  const b = z.gzip('b')
  const c = z.gzip('c')

  console.log(await a, await b, await c)
}
