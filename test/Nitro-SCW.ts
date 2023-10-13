import hre, { ethers } from 'hardhat'
import { type NitroSmartContractWallet } from '../typechain-types'
import { type BaseWallet } from 'ethers'
import { type UserOperationStruct } from '../typechain-types/Nitro-SCW.sol/NitroSmartContractWallet'
import { expect } from 'chai'
import { getUserOpHash, signUserOp } from './UserOp'

describe('Nitro-SCW', function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployNitroSCW (): Promise<{ nitroSCW: NitroSmartContractWallet, owner: BaseWallet, intermediary: BaseWallet }> {
    const deployer = await hre.ethers.getContractFactory('NitroSmartContractWallet')

    const owner = ethers.Wallet.createRandom()
    const intermediary = ethers.Wallet.createRandom()
    const hardhatFundedAccount = (await hre.ethers.getSigners())[0]

    await hardhatFundedAccount.sendTransaction({ to: owner.address, value: ethers.parseEther('1.0') })
    await hardhatFundedAccount.sendTransaction({ to: intermediary.address, value: ethers.parseEther('1.0') })

    const nitroSCW = await deployer.deploy(owner, intermediary)
    return { nitroSCW, owner, intermediary }
  }

  describe('Deployment', function () {
    it('Should deploy the nitro SCW', async function () {
      await deployNitroSCW()
    })
  })

  describe('validateUserOp', function () {
    it('Should return success if the userOp is signed by the owner and the intermediary', async function () {
      const { nitroSCW, owner, intermediary } = await deployNitroSCW()
      const n = await ethers.provider.getNetwork()
      const userOp: UserOperationStruct = {
        sender: owner.address,
        nonce: 0,
        initCode: hre.ethers.ZeroHash,
        callData: hre.ethers.ZeroHash,
        callGasLimit: 0,
        verificationGasLimit: 0,
        preVerificationGas: 0,
        maxFeePerGas: 0,
        maxPriorityFeePerGas: 0,
        paymasterAndData: hre.ethers.ZeroHash,
        signature: hre.ethers.ZeroHash
      }

      const ownerSig = signUserOp(userOp, owner, ethers.ZeroAddress, Number(n.chainId))
      const intermediarySig = signUserOp(userOp, intermediary, ethers.ZeroAddress, Number(n.chainId))
      const hash = getUserOpHash(userOp, ethers.ZeroAddress, Number(n.chainId))

      userOp.signature = ethers.concat([ownerSig, intermediarySig])

      // staticCall forces an eth_call, allowing us to easily check the result
      const result = await nitroSCW.getFunction('validateUserOp').staticCall(userOp, hash, 0)
      expect(result).to.equal(0)
    })
    it.skip('Should only allow challenges if the userOp is signed by the owner', async function () {})
  })
})
