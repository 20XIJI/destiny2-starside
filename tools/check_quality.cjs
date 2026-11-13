'use strict'
const { main } = require('./quality/harness.cjs')

require('./quality/api.cjs')
require('./quality/admin.cjs')
require('./quality/frontend.cjs')
require('./quality/weapons.cjs')
require('./quality/rotation.cjs')

main().catch((error) => { console.error(error); process.exitCode = 1 })
