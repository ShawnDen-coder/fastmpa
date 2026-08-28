import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const version = process.argv[2]

if (!version) {
  throw new Error('Usage: node packages/agent-core/scripts/set-version.mjs <version>')
}

const packagePath = fileURLToPath(new URL('../package.json', import.meta.url))
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))

packageJson.version = version
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)