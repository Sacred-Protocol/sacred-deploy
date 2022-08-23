const { wtns } = require('snarkjs')
const { utils } = require('ffjavascript')
const jsSHA = require('jssha')
const fs = require('fs')
const tmp = require('tmp-promise')
const {poseidonHash, bitsToNumber, toHex, numToBuffer} = require('../../sacred-contracts-eth/lib/baseUtils')
const {convertProofToSolidityInput} = require('../../sacred-contracts-eth/lib/utils')
const util = require('util')
const exec = util.promisify(require('child_process').exec)

const toBuffer = (value, length) => numToBuffer(BigInt(value), length, 'be')

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

function prove(input, snarkPath) {
  const appPath = snarkPath + "/BatchTreeUpdate_cpp/BatchTreeUpdate"
  return tmp.dir().then(async (dir) => {
    dir = dir.path
    let out

    try {
      fs.writeFileSync(`${dir}/input.json`, JSON.stringify(input, null, 2))
      if (fs.existsSync(`${appPath}`)) {
        // native witness calc
        out = await exec(`${appPath} ${dir}/input.json ${dir}/witness.wtns`)
      } else {
        // wasm witness calc
        const wasmAppPath = snarkPath + "/BatchTreeUpdate_js"
        out = await exec(`node ${wasmAppPath}/generate_witness.js ${wasmAppPath}/BatchTreeUpdate.wasm ${dir}/input.json ${dir}/witness.wtns`)
      }
      out = await exec(
        `npx snarkjs groth16 prove ${snarkPath}/BatchTreeUpdate_0001.zkey ${dir}/witness.wtns ${dir}/proof.json ${dir}/public.json`,
      )
    } catch (e) {
      console.log(out, e)
      throw e
    }
    const proof = JSON.parse(fs.readFileSync(`${dir}/proof.json`))
    const publicSignals = JSON.parse(fs.readFileSync(`${dir}/public.json`))
    return convertProofToSolidityInput(proof, publicSignals)
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
