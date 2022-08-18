const { wtns } = require('snarkjs')
const { utils } = require('ffjavascript')
const jsSHA = require('jssha')
const fs = require('fs')
const tmp = require('tmp-promise')
const {poseidonHash, bitsToNumber, toHex} = require('../../sacred-contracts-eth/lib/baseUtils')
const util = require('util')
const exec = util.promisify(require('child_process').exec)

function toBuffer(value, length) {
  return Buffer.from(toHex(BigInt(value), length), 'hex', )
}

function hashInputs(input) {
  const sha = new jsSHA('SHA-256', 'ARRAYBUFFER')
  sha.update(toBuffer(input.oldRoot, 32))
  sha.update(toBuffer(input.newRoot, 32))
  sha.update(toBuffer(input.pathIndices, 4))

  for (let i = 0; i < input.instances.length; i++) {
    sha.update(toBuffer(input.hashes[i], 32))
    sha.update(toBuffer(input.instances[i], 20))
    sha.update(toBuffer(input.blocks[i], 4))
  }

  const hash = '0x' + sha.getHash('HEX')
  const result = BigInt(hash) % BigInt('21888242871839275222246405745257275088548364400416034343698204186575808495617')
  return result.toString()
}

function prove(input, keyBasePath) {
  return tmp.dir().then(async (dir) => {
    dir = dir.path
    let out

    try {
      if (fs.existsSync(`${keyBasePath}`)) {
        // native witness calc
        fs.writeFileSync(`${dir}/input.json`, JSON.stringify(input, null, 2))
        out = await exec(`${keyBasePath} ${dir}/input.json ${dir}/witness.json`)
      } else {
        await wtns.debug(
          utils.unstringifyBigInts(input),
          `${keyBasePath}.wasm`,
          `${dir}/witness.wtns`,
          `${keyBasePath}.sym`,
          {},
          console,
        )
        const witness = utils.stringifyBigInts(await wtns.exportJson(`${dir}/witness.wtns`))
        fs.writeFileSync(`${dir}/witness.json`, JSON.stringify(witness, null, 2))
      }
      out = await exec(
        `zkutil prove -c ${keyBasePath}.r1cs -p ${keyBasePath}.params -w ${dir}/witness.json -r ${dir}/proof.json -o ${dir}/public.json`,
      )
    } catch (e) {
      console.log(out, e)
      throw e
    }
    return '0x' + JSON.parse(fs.readFileSync(`${dir}/proof.json`)).proof
  })
}

/**
 * Generates inputs for a snark and sacred trees smart contract.
 * This function updates MerkleTree argument
 *
 * @param tree Merkle tree with current smart contract state. This object is mutated during function execution.
 * @param events New batch of events to insert.
 * @returns {{args: [string, string, string, string, *], input: {pathElements: *, instances: *, blocks: *, newRoot: *, hashes: *, oldRoot: *, pathIndices: string}}}
 */
function batchTreeUpdate(tree, events) {
  const batchHeight = Math.log2(events.length)
  if (!Number.isInteger(batchHeight)) {
    throw new Error('events length has to be power of 2')
  }

  const oldRoot = tree.root().toString()
  const leaves = events.map((e) => poseidonHash([e.instance, e.hash, e.block]))
  tree.bulkInsert(leaves)
  const newRoot = tree.root().toString()
  let { pathElements, pathIndices } = tree.path(tree.elements().length - 1)
  pathElements = pathElements.slice(batchHeight).map((a) => BigInt(a).toString())
  pathIndices = bitsToNumber(pathIndices.slice(batchHeight)).toString()

  const input = {
    oldRoot,
    newRoot,
    pathIndices,
    pathElements,
    instances: events.map((e) => BigInt(e.instance).toString()),
    hashes: events.map((e) => BigInt(e.hash).toString()),
    blocks: events.map((e) => BigInt(e.block).toString()),
  }

  input.argsHash = hashInputs(input)

  const args = [
    toHex(input.argsHash),
    toHex(input.oldRoot),
    toHex(input.newRoot),
    toHex(input.pathIndices, 4),
    events.map((e) => ({
      hash: toHex(e.hash),
      instance: toHex(e.instance, 20),
      block: toHex(e.block, 4),
    })),
  ]
  return { input, args }
  // const proofData = await websnarkUtils.genWitnessAndProve(
  //   this.groth16,
  //   input,
  //   this.provingKeys.batchTreeUpdateCircuit,
  //   this.provingKeys.batchTreeUpdateProvingKey,
  // )
  // const { proof } = websnarkUtils.toSolidityInput(proofData)

  // const args = [
  //   toHex(input.oldRoot),
  //   toHex(input.newRoot),
  //   toHex(input.pathIndices),
  //   events.map((e) => ({
  //     instance: toHex(e.instance, 20),
  //     hash: toHex(e.hash),
  //     block: toHex(e.block),
  //   })),
  // ]

  // return {
  //   proof,
  //   args,
  // }
}

module.exports = { batchTreeUpdate, prove }
