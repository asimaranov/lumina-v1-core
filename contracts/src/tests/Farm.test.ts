import { AccountUpdate, Bool, fetchAccount, MerkleTree, Mina, Poseidon, PrivateKey, PublicKey, Signature, UInt64, UInt8 } from 'o1js';


import { FungibleTokenAdmin, FungibleToken, PoolFactory, Pool, PoolTokenHolder, SignerMerkleWitness } from '../index';
import { Farm } from '../farming/Farm';
import { FarmTokenHolder } from '../farming/FarmTokenHolder';

let proofsEnabled = false;

describe('Farming pool mina', () => {
  let deployerAccount: Mina.TestPublicKey,
    deployerKey: PrivateKey,
    senderAccount: Mina.TestPublicKey,
    senderKey: PrivateKey,
    bobAccount: Mina.TestPublicKey,
    bobKey: PrivateKey,
    merkle: MerkleTree,
    aliceAccount: Mina.TestPublicKey,
    aliceKey: PrivateKey,
    dylanAccount: Mina.TestPublicKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: PoolFactory,
    zkPoolMinaAddress: PublicKey,
    zkPoolMinaPrivateKey: PrivateKey,
    zkPoolMina: Pool,
    zkTokenAdminAddress: PublicKey,
    zkTokenAdminPrivateKey: PrivateKey,
    zkTokenAdmin: FungibleTokenAdmin,
    zkTokenAddress0: PublicKey,
    zkTokenPrivateKey0: PrivateKey,
    zkToken0: FungibleToken,
    zkTokenAddress1: PublicKey,
    zkTokenPrivateKey1: PrivateKey,
    zkToken1: FungibleToken,
    zkTokenAddress2: PublicKey,
    zkTokenPrivateKey2: PrivateKey,
    zkToken2: FungibleToken,
    zkFarmTokenAddress: PublicKey,
    zkFarmTokenPrivateKey: PrivateKey,
    zkFarmToken: Farm,
    zkFarmTokenHolder: FarmTokenHolder,
    tokenHolder: PoolTokenHolder;

  beforeAll(async () => {
    const analyze = await Pool.analyzeMethods();
    getGates(analyze);

    if (proofsEnabled) {
      console.time('compile pool');
      await FungibleTokenAdmin.compile();
      await FungibleToken.compile();
      await PoolFactory.compile();
      await Pool.compile();
      await PoolTokenHolder.compile();
      await Farm.compile();
      console.timeEnd('compile pool');
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
    // no transaction limits on zeko
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

    zkPoolMinaPrivateKey = PrivateKey.random();
    zkPoolMinaAddress = zkPoolMinaPrivateKey.toPublicKey();
    zkPoolMina = new Pool(zkPoolMinaAddress);

    zkFarmTokenPrivateKey = PrivateKey.random();
    zkFarmTokenAddress = zkFarmTokenPrivateKey.toPublicKey();
    zkFarmToken = new Farm(zkFarmTokenAddress);
    zkFarmTokenHolder = new FarmTokenHolder(zkFarmTokenAddress, zkPoolMina.deriveTokenId());

    zkTokenAdminPrivateKey = PrivateKey.random();
    zkTokenAdminAddress = zkTokenAdminPrivateKey.toPublicKey();
    zkTokenAdmin = new FungibleTokenAdmin(zkTokenAdminAddress);

    let keyTokenX = PrivateKey.random();
    let keyTokenY = PrivateKey.random();

    // order token to create pool
    let xIsLower = keyTokenX.toPublicKey().x.lessThan(keyTokenY.toPublicKey().x);

    zkTokenPrivateKey0 = xIsLower.toBoolean() ? keyTokenX : keyTokenY;
    zkTokenAddress0 = zkTokenPrivateKey0.toPublicKey();
    zkToken0 = new FungibleToken(zkTokenAddress0);

    zkTokenPrivateKey1 = xIsLower.toBoolean() ? keyTokenY : keyTokenX;
    zkTokenAddress1 = zkTokenPrivateKey1.toPublicKey();
    zkToken1 = new FungibleToken(zkTokenAddress1);

    zkTokenPrivateKey2 = PrivateKey.random();
    zkTokenAddress2 = zkTokenPrivateKey2.toPublicKey();
    zkToken2 = new FungibleToken(zkTokenAddress2);

    tokenHolder = new PoolTokenHolder(zkPoolMinaAddress, zkToken0.deriveTokenId());

    merkle = new MerkleTree(32);
    merkle.setLeaf(0n, Poseidon.hash(bobAccount.toFields()));
    merkle.setLeaf(1n, Poseidon.hash(aliceAccount.toFields()));
    const root = merkle.getRoot();


    const txn = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 4);
      await zkApp.deploy({
        symbol: "FAC", src: "https://luminadex.com/",
        owner: bobAccount, protocol: aliceAccount, delegator: dylanAccount,
        approvedSigner: root
      });
      await zkTokenAdmin.deploy({
        adminPublicKey: deployerAccount,
      });
      await zkToken0.deploy({
        symbol: "LTA",
        src: "https://github.com/MinaFoundation/mina-fungible-token/blob/main/FungibleToken.ts",
      });
      await zkToken0.initialize(
        zkTokenAdminAddress,
        UInt8.from(9),
        Bool(false),
      )
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey, zkTokenAdminPrivateKey, zkTokenPrivateKey0]).send();

    //deploy token 2
    const txn2 = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 2);
      await zkToken1.deploy({
        symbol: "LTB",
        src: "https://github.com/MinaFoundation/mina-fungible-token/blob/main/FungibleToken.ts",
      });
      await zkToken1.initialize(
        zkTokenAdminAddress,
        UInt8.from(9),
        Bool(false),
      )
    });
    await txn2.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn2.sign([deployerKey, zkAppPrivateKey, zkTokenAdminPrivateKey, zkTokenPrivateKey1]).send();

    //deploy token 3
    const txn4 = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 2);
      await zkToken2.deploy({
        symbol: "REW",
        src: "https://github.com/MinaFoundation/mina-fungible-token/blob/main/FungibleToken.ts",
      });
      await zkToken2.initialize(
        zkTokenAdminAddress,
        UInt8.from(9),
        Bool(false),
      )
    });
    await txn4.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn4.sign([deployerKey, zkAppPrivateKey, zkTokenAdminPrivateKey, zkTokenPrivateKey2]).send();


    const witness = merkle.getWitness(0n);
    const circuitWitness = new SignerMerkleWitness(witness);
    const signature2 = Signature.create(zkTokenPrivateKey1, zkPoolMinaAddress.toFields());
    const txn6 = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 4);
      await zkApp.createPool(zkPoolMinaAddress, zkTokenAddress1, zkTokenAddress1, signature2, circuitWitness);
    });
    console.log("Pool Mina creation au", txn6.transaction.accountUpdates.length);
    await txn6.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn6.sign([deployerKey, zkPoolMinaPrivateKey]).send();

    let start = Date.now() - 100_000;
    let end = start + 100_000;
    let txn10 = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 2);
      await zkFarmToken.deploy({
        owner: deployerAccount,
        pool: zkPoolMinaAddress,
        startTimestamp: new UInt64(start),
        endTimestamp: new UInt64(end),
      });
      await zkFarmTokenHolder.deploy({
        owner: deployerAccount
      });
      await zkPoolMina.approveAccountUpdate(zkFarmTokenHolder.self);
    });
    console.log("zkFarmToken deploy", txn10.toPretty());
    await txn10.prove();
    await txn10.sign([zkFarmTokenPrivateKey, deployerKey]).send();

    // mint token to user
    await mintToken(deployerAccount);
    await mintToken(senderAccount);
    await mintToken(bobAccount);
    await mintToken(aliceAccount);

    let amt = UInt64.from(10 * 10 ** 9);
    let amtToken = UInt64.from(50 * 10 ** 9);
    let txn5 = await Mina.transaction(senderAccount, async () => {
      AccountUpdate.fundNewAccount(senderAccount, 1);
      await zkPoolMina.supplyFirstLiquiditiesToken(amt, amtToken);
    });
    await txn5.prove();
    await txn5.sign([senderKey]).send();


    let amtMina = UInt64.from(1 * 10 ** 9);
    let amtToken2 = UInt64.from(5 * 10 ** 9);
    const totalLiquidity = Mina.getBalance(zkPoolMinaAddress, zkPoolMina.deriveTokenId());
    const amtToken0 = Mina.getBalance(zkPoolMinaAddress, zkToken0.deriveTokenId());
    const amtToken1 = Mina.getBalance(zkPoolMinaAddress, zkToken1.deriveTokenId());
    let txn8 = await Mina.transaction(bobAccount, async () => {
      AccountUpdate.fundNewAccount(bobAccount, 1);
      await zkPoolMina.supplyLiquidityToken(amtMina, amtToken2, amtToken0, amtToken1, totalLiquidity);
    });
    await txn8.prove();
    await txn8.sign([bobKey]).send();


  });


  it('deposit withdraw', async () => {

    await fetchAccount({ publicKey: zkFarmTokenAddress })

    let txn = await Mina.transaction(senderAccount, async () => {
      AccountUpdate.fundNewAccount(senderAccount, 1);
      await zkFarmToken.deposit(UInt64.from(1000));
    });
    await txn.prove();
    console.log("zkFarmToken deposit", txn.toPretty());
    await txn.sign([senderKey]).send();

    const balance = Mina.getBalance(zkFarmTokenAddress, zkPoolMina.deriveTokenId());
    expect(balance.toBigInt()).toEqual(1000n);

    const balanceLiquidity = Mina.getBalance(senderAccount, zkFarmToken.deriveTokenId());
    expect(balanceLiquidity.toBigInt()).toEqual(1000n);

    txn = await Mina.transaction(senderAccount, async () => {
      await zkFarmTokenHolder.withdraw(UInt64.from(1000));
      await zkPoolMina.approveAccountUpdate(zkFarmTokenHolder.self);
    });
    await txn.prove();
    console.log("zkFarmToken withdraw", txn.toPretty());
    await txn.sign([senderKey]).send();

    const balanceAfter = Mina.getBalance(zkFarmTokenAddress, zkPoolMina.deriveTokenId());
    expect(balanceAfter.toBigInt()).toEqual(0n);

    const balanceLiquidityAfter = Mina.getBalance(senderAccount, zkFarmToken.deriveTokenId());
    expect(balanceLiquidityAfter.toBigInt()).toEqual(0n);
  });


  async function mintToken(user: PublicKey) {
    // token are minted to original deployer, so just transfer it for test
    let txn = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 1);
      await zkToken0.mint(user, UInt64.from(1000 * 10 ** 9));
    });
    await txn.prove();
    await txn.sign([deployerKey, zkTokenPrivateKey0]).send();

    txn = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 1);
      await zkToken1.mint(user, UInt64.from(1000 * 10 ** 9));
    });
    await txn.prove();
    await txn.sign([deployerKey, zkTokenPrivateKey1]).send();

    txn = await Mina.transaction(deployerAccount, async () => {
      AccountUpdate.fundNewAccount(deployerAccount, 1);
      await zkToken2.mint(user, UInt64.from(1000 * 10 ** 9));
    });
    await txn.prove();
    await txn.sign([deployerKey, zkTokenPrivateKey2]).send();

  }

});