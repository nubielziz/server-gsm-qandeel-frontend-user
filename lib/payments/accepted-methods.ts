// The payment methods the footer names (owner, 2026-11-23): a fixed list the owner gave, written here and not read from the
// API. The checkout offers what staff switch on in the console; this list only tells a visitor what the shop can take.
// A method's `logo` is a file of public/images/payment-marks (docs/LOGOS.md); one without a file shows an icon instead.
// The names are brand names: they are not translated.

export type AcceptedMethod = {
  name: string;
  /** A file of public/images/payment-marks. */
  logo?: string;
  /** Shown when there is no logo file: a bank for a transfer, a wallet for a wallet. */
  icon?: "bank" | "wallet";
};

export type AcceptedGroupKey = "cards" | "exchanges" | "crypto";

export type AcceptedGroup = { key: AcceptedGroupKey; methods: readonly AcceptedMethod[] };

export const ACCEPTED_PAYMENTS: readonly AcceptedGroup[] = [
  {
    key: "cards",
    methods: [
      { name: "Visa", logo: "visa.png" },
      { name: "Mastercard", logo: "mastercard.png" },
      { name: "Bank transfers", icon: "bank" },
    ],
  },
  {
    key: "exchanges",
    methods: [
      { name: "Binance Pay", logo: "binance.png" },
      { name: "Binance Pay C2C", logo: "binance.png" },
      { name: "Gate.io Pay", logo: "gate-io.png" },
    ],
  },
  {
    key: "crypto",
    methods: [
      { name: "USDT", logo: "usdt.png" },
      { name: "USDC", logo: "usdc.png" },
      { name: "Bitcoin (BTC)", logo: "bitcoin.png" },
      { name: "Ethereum (ETH)", logo: "ethereum.png" },
      { name: "TRON (TRC-20)", logo: "tron.png" },
      { name: "BNB Smart Chain (BEP-20)", logo: "bnb-chain.png" },
      // opBNB is a network of BNB Chain and has no mark of its own in the sources of docs/LOGOS.md.
      { name: "opBNB", logo: "bnb-chain.png" },
      { name: "Polygon", logo: "polygon.png" },
      { name: "Arbitrum One", logo: "arbitrum.png" },
      { name: "Optimism (OP Mainnet)", logo: "optimism.png" },
      { name: "Base", logo: "base.png" },
      { name: "Solana", logo: "solana.png" },
      { name: "Trust Wallet", logo: "trust-wallet.png" },
      { name: "MetaMask", logo: "metamask.png" },
      { name: "TronLink", logo: "tronlink.png" },
      { name: "WalletConnect", logo: "walletconnect.png" },
      { name: "Express Wallet", icon: "wallet" },
    ],
  },
];
