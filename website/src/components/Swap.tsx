"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSearchParams } from "next/navigation";
import { PublicKey } from "o1js";
// @ts-ignore
import CurrencyFormat from "react-currency-format";
import { getAmountOut } from "../../../contracts/src/indexmina";

type Percent = number | string;

// @ts-ignore
const Swap = ({ accountState }) => {
  const [mina, setMina] = useState<any>();

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (window && (window as any).mina) {
      setMina((window as any).mina);
    }

  }, [])

  const zkState = accountState;

  const [toDai, setToDai] = useState(true);

  const [fromAmount, setFromAmount] = useState("");

  const [toAmount, setToAmount] = useState("0.0");

  const [slippagePercent, setSlippagePercent] = useState<number>(1);

  const [data, setData] = useState({ amountIn: 0, amountOut: 0, balanceOutMin: 0, balanceInMax: 0 });


  useEffect(() => {
    if (parseFloat(fromAmount)) {
      getSwapAmount().then(x => setData(x));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromAmount, slippagePercent]);


  const getSwapAmount = async () => {
    const reserves = await zkState?.zkappWorkerClient?.getReserves();
    let calcul = { amountIn: 0, amountOut: 0, balanceOutMin: 0, balanceInMax: 0 };
    const slippage = slippagePercent;
    if (reserves?.amountMina && reserves?.amountToken) {
      const amountMina = parseInt(reserves?.amountMina);
      const amountToken = parseInt(reserves?.amountToken);
      let amt = parseFloat(fromAmount) * 10 ** 9;
      console.log("amtIn", amt);
      if (!toDai) {
        calcul = getAmountOut(amt, amountToken, amountMina, slippage);
        console.log("calcul from dai", calcul);
        setToAmount(calcul.toString());
      } else {
        calcul = getAmountOut(amt, amountMina, amountToken, slippage);
        console.log("calcul from mina", calcul);
        setToAmount(calcul.toString());
      }
    }
    return calcul;
  }

  const swap = async () => {
    try {
      setLoading(true);
      console.log("infos", { fromAmount, toAmount });

      if (mina) {
        console.log("zkState", zkState)
        const user: string = (await mina.requestAccounts())[0];
        if (!toDai) {
          const create = await zkState.zkappWorkerClient?.swapFromToken(user, data.amountIn, data.amountOut, data.balanceOutMin, data.balanceInMax);
        } else {
          const create = await zkState.zkappWorkerClient?.swapFromMina(user, data.amountIn, data.amountOut, data.balanceOutMin, data.balanceInMax);
        }
        const json = await zkState.zkappWorkerClient?.getTransactionJSON();
        await mina.sendTransaction({ transaction: json });
      }
    } catch (error) {
      console.log('swap error', error);
    }
    finally {
      setLoading(false);
    }

  }

  return (
    <>
      <div className="flex flex-row justify-center w-screen ">
        <div style={{ backgroundColor: "rgba(0,0,0,0.2)" }} className="flex flex-col p-5 gap-5 rounded w-[300px] h-[300px] items-center">
          <div className="text-xl">
            Swap
          </div>
          <div>
            <span>Slippage (%) : </span><input type="number" defaultValue={slippagePercent} onChange={(event) => setSlippagePercent(event.target.value)}></input>
          </div>
          <div className="flex flex-row w-full">
            <CurrencyFormat
              className="w-48 border-black text-default pr-3 text-xl text-right rounded focus:outline-none "
              thousandSeparator={true}
              decimalScale={6}
              placeholder="0.0"
              value={fromAmount}
              onValueChange={({ value }) => setFromAmount(value)}
            />
            {toDai ? <span className="w-24 text-center">Mina</span> : <span className="w-24 text-center">Dai</span>}
          </div>
          <div>
            <button onClick={() => setToDai(!toDai)} className="w-8 bg-cyan-500 text-lg text-white rounded">
              &#8645;
            </button>
          </div>
          <div className="flex flex-row w-full">
            <CurrencyFormat
              className="w-48 border-slate-50 text-default  pr-3 text-xl text-right text-xl rounded focus:outline-none "
              thousandSeparator={true}
              decimalScale={6}
              placeholder="0.0"
              value={toAmount}
              onValueChange={({ value }) => setToAmount(value)}
            />
            {!toDai ? <span className="w-24 text-center">Mina</span> : <span className="w-24 text-center">Dai</span>}
          </div>
          {loading ? <p>Creating transaction ...</p> : <button onClick={swap} className="w-full bg-cyan-500 text-lg text-white p-1 rounded">
            Swap
          </button>

          }

        </div>
      </div>
    </>
  );
};

export default Swap;
