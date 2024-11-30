import { FungibleToken, FungibleTokenAdmin } from 'mina-fungible-token';
import { AccountUpdate, Bool, Cache, CircuitString, fetchAccount, Field, MerkleMap, MerkleTree, Mina, Poseidon, PrivateKey, PublicKey, Signature, UInt64, UInt8, VerificationKey } from 'o1js';
import { contractHash, contractHolderHash, Faucet, PoolData, PoolFactory, PoolTokenHolder, Pool, SignerMerkleWitness } from '../index';
import { PoolSampleTest } from './PoolSampleTest';
import { PoolUpgradeTest } from './PoolUpgradeTest';
import { PoolHolderUpgradeTest } from './PoolHolderUpgradeTest';

let proofsEnabled = false;


describe('Pool data', () => {
  let deployerAccount: Mina.TestPublicKey,
    deployerKey: PrivateKey,
    senderAccount: Mina.TestPublicKey,
    senderKey: PrivateKey,
    bobAccount: Mina.TestPublicKey,
    bobKey: PrivateKey,
    compileKey: VerificationKey,
    merkle: MerkleTree,
    vk: any,
    aliceAccount: Mina.TestPublicKey,
    aliceKey: PrivateKey,
    dylanAccount: Mina.TestPublicKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: PoolFactory,
    zkPoolAddress: PublicKey,
    zkPoolPrivateKey: PrivateKey,
    zkPool: Pool,
    zkPoolDataAddress: PublicKey,
    zkPoolDataPrivateKey: PrivateKey,
    zkPoolData: PoolData,
    zkTokenAdminAddress: PublicKey,
    zkTokenAdminPrivateKey: PrivateKey,
    zkTokenAdmin: FungibleTokenAdmin,
    zkTokenAddress: PublicKey,
    zkTokenPrivateKey: PrivateKey,
    zkToken: FungibleToken,
    zkToken2PrivateKey: PrivateKey,
    zkToken2Address: PublicKey,
    zkToken2: FungibleToken,
    tokenHolder: PoolTokenHolder;

  beforeAll(async () => {
    //const analyze = await Faucet.analyzeMethods();
    //getGates(analyze);

    const cache = Cache.FileSystem('./cache');
    vk = await PoolSampleTest.compile({ cache });
    const compileResult = await PoolUpgradeTest.compile({ cache });
    compileKey = compileResult.verificationKey;


    if (proofsEnabled) {
      console.time('compile PoolData');
      await PoolData.compile({ cache });
      await FungibleTokenAdmin.compile({ cache });
      await FungibleToken.compile({ cache });
      await PoolFactory.compile({ cache });
      await Pool.compile({ cache });
      await PoolTokenHolder.compile({ cache });
      console.timeEnd('compile PoolData');
    }


    function getGates(analyze: any) {
      for (const key in analyze) {
        if (Object.prototype.hasOwnProperty.call(analyze, key)) {
          const element = analyze[key];
          console.log(key, element?.gates.length)
        }
      }
    }
  });



  beforeEach(async () => {
    const Local = await Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    [deployerAccount, senderAccount, bobAccount, aliceAccount, dylanAccount] = Local.testAccounts;
    deployerKey = deployerAccount.key;
    senderKey = senderAccount.key;
    bobKey = bobAccount.key;
    aliceKey = aliceAccount.key;

    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new PoolFactory(zkAppAddress);

    zkPoolPrivateKey = PrivateKey.random();
    zkPoolAddress = zkPoolPrivateKey.toPublicKey();
    zkPool = new Pool(zkPoolAddress);

    zkTokenAdminPrivateKey = PrivateKey.random();
    zkTokenAdminAddress = zkTokenAdminPrivateKey.toPublicKey();
    zkTokenAdmin = new FungibleTokenAdmin(zkTokenAdminAddress);

    zkPoolDataPrivateKey = PrivateKey.random();
    zkPoolDataAddress = zkPoolDataPrivateKey.toPublicKey();
    zkPoolData = new PoolData(zkPoolDataAddress);

    zkTokenPrivateKey = PrivateKey.random();
    zkTokenAddress = zkTokenPrivateKey.toPublicKey();
    zkToken = new FungibleToken(zkTokenAddress);

    zkToken2PrivateKey = PrivateKey.random();
    zkToken2Address = zkToken2PrivateKey.toPublicKey();
    zkToken2 = new FungibleToken(zkToken2Address);

    tokenHolder = new PoolTokenHolder(zkPoolAddress, zkToken.deriveTokenId());

    const txn0 = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 1);
      await zkPoolData.deploy({
        owner: bobAccount,
        protocol: aliceAccount,
        delegator: dylanAccount
      });

    });
    await txn0.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn0.sign([deployerKey, zkPoolDataPrivateKey]).send();

    merkle = new MerkleTree(32);
    merkle.setLeaf(0n, Poseidon.hash(bobAccount.toFields()));
    merkle.setLeaf(1n, Poseidon.hash(aliceAccount.toFields()));
    const root = merkle.getRoot();

    const txn = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 4);
      await zkApp.deploy({ symbol: "FAC", src: "https://luminadex.com/", poolData: zkPoolDataAddress, approvedSigner: root });
      await zkTokenAdmin.deploy({
        adminPublicKey: deployerAccount,
      });
      await zkToken.deploy({
        symbol: "LTA",
        src: "https://github.com/MinaFoundation/mina-fungible-token/blob/main/FungibleToken.ts",
      });
      await zkToken.initialize(
        zkTokenAdminAddress,
        UInt8.from(9),
        Bool(false),
      )
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey, zkTokenAdminPrivateKey, zkTokenPrivateKey]).send();

    const txn5 = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 2);
      await zkToken2.deploy({
        symbol: "LTA",
        src: "https://github.com/MinaFoundation/mina-fungible-token/blob/main/FungibleToken.ts",
      });
      await zkToken2.initialize(
        zkTokenAdminAddress,
        UInt8.from(9),
        Bool(false),
      )
    });
    await txn5.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn5.sign([deployerKey, zkToken2PrivateKey]).send();

    const signature = Signature.create(zkTokenPrivateKey, zkPoolAddress.toFields());
    const witness = merkle.getWitness(0n);
    const circuitWitness = new SignerMerkleWitness(witness);
    const txn3 = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 4);
      await zkApp.createPool(zkPoolAddress, zkTokenAddress, zkTokenAddress, signature, circuitWitness);
    });

    //console.log("Pool creation au", txn3.transaction.accountUpdates.length);
    await txn3.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn3.sign([deployerKey, zkPoolPrivateKey]).send();

  });


  it('update owner', async () => {
    let owner = await zkPoolData.owner.fetch();
    expect(owner?.toBase58()).toEqual(bobAccount.toBase58());
    let txn = await Mina.transaction(senderAccount, async () => {
      await zkPoolData.setNewOwner(senderAccount);
    });
    await txn.prove();
    await txn.sign([senderKey, bobKey]).send();

    let newowner = await zkPoolData.newOwner.fetch();
    expect(newowner?.toBase58()).toEqual(senderAccount.toBase58());

    let oldowner = await zkPoolData.owner.fetch();
    expect(oldowner?.toBase58()).toEqual(bobAccount.toBase58());

    // aceept ownership
    txn = await Mina.transaction(senderAccount, async () => {
      await zkPoolData.acceptOwnership();
    });
    await txn.prove();
    await txn.sign([senderKey]).send();

    let ownership = await zkPoolData.owner.fetch();
    expect(ownership?.toBase58()).toEqual(senderAccount.toBase58());

  });

  it('update protocol', async () => {

    let protocol = await zkPoolData.protocol.fetch();
    expect(protocol?.toBase58()).toEqual(aliceAccount.toBase58());
    let txn = await Mina.transaction(senderAccount, async () => {
      await zkPoolData.setNewProtocol(deployerAccount);
    });
    await txn.prove();
    await txn.sign([senderKey, bobKey]).send();

    let protocolNew = await zkPoolData.protocol.fetch();
    expect(protocolNew?.toBase58()).toEqual(deployerAccount.toBase58());

  });

  it('set delegator', async () => {

    let delegator = await zkPoolData.delegator.fetch();
    let poolAccount = zkPool.account?.delegate?.get();
    expect(delegator?.toBase58()).toEqual(dylanAccount.toBase58());
    expect(poolAccount?.toBase58()).toEqual(zkPoolAddress.toBase58());

    let txn = await Mina.transaction(senderAccount, async () => {
      await zkPool.setDelegator();
    });
    await txn.prove();
    await txn.sign([senderKey]).send();

    poolAccount = zkPool.account?.delegate?.get();
    expect(poolAccount?.toBase58()).toEqual(dylanAccount.toBase58());

    // already set
    await expect(Mina.transaction(senderAccount, async () => {
      await zkPool.setDelegator();
    })).rejects.toThrow();
    poolAccount = zkPool.account?.delegate?.get();
    expect(poolAccount?.toBase58()).toEqual(dylanAccount.toBase58());

    // define a new delegator
    txn = await Mina.transaction(senderAccount, async () => {
      await zkPoolData.setNewDelegator(aliceAccount);
    });
    await txn.prove();
    await txn.sign([senderKey, bobKey]).send();

    txn = await Mina.transaction(senderAccount, async () => {
      await zkPool.setDelegator();
    });
    await txn.prove();
    console.log("set delegator", txn.toPretty());
    await txn.sign([senderKey]).send();

    poolAccount = zkPool.account?.delegate?.get();
    console.log("pool account", poolAccount.toBase58());
    expect(poolAccount?.toBase58()).toEqual(aliceAccount.toBase58());
  });


  it('failed change delegator', async () => {

    // only owner can change it
    let txn = await Mina.transaction(senderAccount, async () => {
      await zkPoolData.setNewDelegator(aliceAccount);
    });
    await txn.prove();
    await expect(txn.sign([senderKey]).send()).rejects.toThrow();

  });


  it('update verification key', async () => {
    let txn = await Mina.transaction(senderAccount, async () => {
      await zkPoolData.updateVerificationKey(vk.verificationKey);
    });
    await txn.prove();
    await txn.sign([senderKey, bobKey]).send();

    let poolDatav2 = new PoolSampleTest(zkPoolDataAddress);
    let version = await poolDatav2.version();
    expect(version?.toBigInt()).toEqual(2n);

  });

  it('failed without owner key', async () => {
    let txn = await Mina.transaction(senderAccount, async () => {
      await zkPoolData.updateVerificationKey(vk.verificationKey);
    });
    await txn.prove();
    await expect(txn.sign([senderKey]).send()).rejects.toThrow();

    txn = await Mina.transaction(senderAccount, async () => {
      await zkPoolData.setNewOwner(senderAccount);
    });
    await txn.prove();
    await expect(txn.sign([senderKey]).send()).rejects.toThrow();


    txn = await Mina.transaction(senderAccount, async () => {
      await zkPoolData.setNewProtocol(senderAccount);
    });
    await txn.prove();
    await expect(txn.sign([senderKey]).send()).rejects.toThrow();

    const root = merkle.getRoot();

    txn = await Mina.transaction(senderAccount, async () => {
      await zkApp.updateApprovedSigner(root);
    });
    await txn.prove();
    await expect(txn.sign([senderKey]).send()).rejects.toThrow();

  });

  it('failed change owner', async () => {
    let owner = await zkPoolData.owner.fetch();
    expect(owner?.toBase58()).toEqual(bobAccount.toBase58());
    let txn = await Mina.transaction(senderAccount, async () => {
      await zkPoolData.setNewOwner(aliceAccount);
    });
    await txn.prove();
    await txn.sign([senderKey, bobKey]).send();

    let newowner = await zkPoolData.newOwner.fetch();
    expect(newowner?.toBase58()).toEqual(aliceAccount.toBase58());

    let oldowner = await zkPoolData.owner.fetch();
    expect(oldowner?.toBase58()).toEqual(bobAccount.toBase58());

    // aceept ownership
    txn = await Mina.transaction(senderAccount, async () => {
      await zkPoolData.acceptOwnership();
    });
    await txn.prove();
    // you need to sign with the new owner key to get the ownership
    await expect(txn.sign([senderKey]).send()).rejects.toThrow();

    let ownership = await zkPoolData.owner.fetch();
    expect(ownership?.toBase58()).toEqual(bobAccount.toBase58());
  });

  it('deploy pool with first authorized account', async () => {
    const newPool = PrivateKey.random();
    const newPoolAddress = newPool.toPublicKey();
    const signature = Signature.create(bobKey, newPoolAddress.toFields());

    const witness = merkle.getWitness(0n);
    const circuitWitness = new SignerMerkleWitness(witness);

    const txn3 = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 4);
      await zkApp.createPool(newPoolAddress, zkToken2Address, bobAccount, signature, circuitWitness);
    });

    //console.log("Pool creation au", txn3.transaction.accountUpdates.length);
    await txn3.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn3.sign([deployerKey, newPool]).send();
  });

  it('deploy pool with second authorized account', async () => {
    const newPool = PrivateKey.random();
    const newPoolAddress = newPool.toPublicKey();
    const signature = Signature.create(aliceKey, newPoolAddress.toFields());
    const witness = merkle.getWitness(1n);
    const circuitWitness = new SignerMerkleWitness(witness);

    const txn3 = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 4);
      await zkApp.createPool(newPoolAddress, zkToken2Address, aliceAccount, signature, circuitWitness);
    });

    //console.log("Pool creation au", txn3.transaction.accountUpdates.length);
    await txn3.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn3.sign([deployerKey, newPool]).send();
  });

  it('deploy pool failed with unauthorized account', async () => {
    const newPool = PrivateKey.random();
    const newPoolAddress = newPool.toPublicKey();
    const signature = Signature.create(senderKey, newPoolAddress.toFields());

    const witness = merkle.getWitness(0n);
    const circuitWitness = new SignerMerkleWitness(witness);

    await expect(Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 4);
      await zkApp.createPool(newPoolAddress, zkToken2Address, senderAccount, signature, circuitWitness);
    })).rejects.toThrow();

    // empty account failed too
    await expect(Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 4);
      await zkApp.createPool(newPoolAddress, zkToken2Address, PublicKey.empty(), signature, circuitWitness);
    })).rejects.toThrow();

    merkle.setLeaf(2n, Poseidon.hash(senderAccount.toFields()));
    const newRoot = merkle.getRoot();
    // works after authorized this account
    let txn = await Mina.transaction(senderAccount, async () => {
      await zkApp.updateApprovedSigner(newRoot);
    });
    await txn.prove();
    await txn.sign([senderKey, bobKey]).send();

    const newWitness = merkle.getWitness(2n);
    const newCircuitWitness = new SignerMerkleWitness(newWitness);
    const txn3 = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 4);
      await zkApp.createPool(newPoolAddress, zkToken2Address, senderAccount, signature, newCircuitWitness);
    });

    await txn3.prove();
    await txn3.sign([deployerKey, newPool]).send();
  });
});