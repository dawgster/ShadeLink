import { Transaction as Transaction$1, TransactionInstruction, PublicKey, Connection } from '@solana/web3.js';
import { Action, Transaction as Transaction$3 } from '@near-js/transactions';
import { FinalExecutionOutcome } from '@near-js/types';
import { TransactionRequest, Address, SignableMessage, TypedDataDefinition, Hex, PublicClient, SignedAuthorization, Hash } from 'viem';
import { HashAuthorizationParameters } from 'viem/experimental';
import * as bitcoin from 'bitcoinjs-lib';
import { EncodeObject } from '@cosmjs/proto-signing';
import { TxRaw } from 'cosmjs-types/cosmos/tx/v1beta1/tx';
import BN from 'bn.js';
import { AnyRawTransaction, Aptos as Aptos$1, MultiAgentTransaction, SimpleTransaction, AccountAuthenticatorEd25519, AccountAuthenticator } from '@aptos-labs/ts-sdk';
import { SuiClient } from '@mysten/sui/client';
import { Transaction as Transaction$2 } from '@mysten/sui/transactions';
import { Client } from 'xrpl';
import { JsonRpcProvider } from '@near-js/providers';
import { KeyPair } from '@near-js/crypto';

interface BTCTransaction {
    vout: Array<{
        scriptpubkey: string;
        value: number;
    }>;
}
interface BTCInput {
    txid: string;
    vout: number;
    value: number;
    scriptPubKey: Buffer;
}
type BTCOutput = {
    value: number;
} | {
    address: string;
    value: number;
} | {
    script: Buffer;
    value: number;
};
type BTCTransactionRequest = {
    publicKey: string;
} & ({
    inputs: BTCInput[];
    outputs: BTCOutput[];
    from?: never;
    to?: never;
    value?: never;
} | {
    inputs?: never;
    outputs?: never;
    from: string;
    to: string;
    value: string;
});
interface BTCUnsignedTransaction {
    psbt: bitcoin.Psbt;
    publicKey: string;
}
type BTCNetworkIds = 'mainnet' | 'testnet' | 'regtest';

type CosmosNetworkIds = string;
type CosmosUnsignedTransaction = TxRaw;
interface CosmosTransactionRequest {
    address: string;
    publicKey: string;
    messages: EncodeObject[];
    memo?: string;
    gas?: number;
}

type EVMUnsignedTransaction = TransactionRequest & {
    type: 'eip1559';
    chainId: number;
};
interface EVMTransactionRequest extends Omit<EVMUnsignedTransaction, 'chainId' | 'type' | 'nonce'> {
    from: Address;
    nonce?: number;
}
interface EVMTransactionRequestLegacy {
    from: `0x${string}`;
    to: `0x${string}`;
    value?: bigint;
    gas?: bigint;
    gasPrice?: bigint;
    nonce?: number;
}
interface EVMUnsignedLegacyTransaction {
    to: `0x${string}`;
    value?: bigint;
    gasPrice: bigint;
    nonce: number;
    gas: bigint;
    chainId: number;
    type: 'legacy';
}
type EVMAuthorizationRequest = HashAuthorizationParameters<'hex'>;
type EVMMessage = SignableMessage;
type EVMTypedData = TypedDataDefinition;
interface UserOperationV7 {
    sender: Hex;
    nonce: Hex;
    factory: Hex;
    factoryData: Hex;
    callData: Hex;
    callGasLimit: Hex;
    verificationGasLimit: Hex;
    preVerificationGas: Hex;
    maxFeePerGas: Hex;
    maxPriorityFeePerGas: Hex;
    paymaster: Hex;
    paymasterVerificationGasLimit: Hex;
    paymasterPostOpGasLimit: Hex;
    paymasterData: Hex;
    signature: Hex;
}
interface UserOperationV6 {
    sender: Hex;
    nonce: Hex;
    initCode: Hex;
    callData: Hex;
    callGasLimit: Hex;
    verificationGasLimit: Hex;
    preVerificationGas: Hex;
    maxFeePerGas: Hex;
    maxPriorityFeePerGas: Hex;
    paymasterAndData: Hex;
    signature: Hex;
}

/**
 * Network identifiers for NEAR blockchain environments
 */
type NearNetworkIds = 'mainnet' | 'testnet';

interface Transaction {
    signerId?: string;
    receiverId: string;
    actions: Action[];
}
type HashToSign = number[] | Uint8Array;
interface SignArgs {
    payloads: HashToSign[];
    path: string;
    keyType: 'Eddsa' | 'Ecdsa';
    signerAccount: {
        accountId: string;
        signAndSendTransactions: (transactions: {
            transactions: Transaction[];
        }) => Promise<FinalExecutionOutcome[]>;
    };
}
declare class ChainSignatureContract {
    private readonly contractId;
    private readonly networkId;
    private readonly provider;
    constructor({ contractId, networkId, fallbackRpcUrls, }: {
        contractId: string;
        networkId: NearNetworkIds;
        fallbackRpcUrls?: string[];
    });
    getCurrentSignatureDeposit(): number;
    sign({ payloads, path, keyType, signerAccount, }: SignArgs): Promise<RSVSignature[]>;
    getPublicKey(): Promise<UncompressedPubKeySEC1>;
    getDerivedPublicKey(args: {
        path: string;
        predecessor: string;
        IsEd25519?: boolean;
    }): Promise<UncompressedPubKeySEC1 | `ed25519:${string}`>;
}

type Base58String = string;
type NajPublicKey = `secp256k1:${Base58String}`;
type UncompressedPubKeySEC1 = `04${string}`;
type CompressedPubKeySEC1 = `02${string}` | `03${string}`;
type Ed25519PubKey = `Ed25519:${string}`;
interface DerivedPublicKeyArgs {
    path: string;
    predecessor: string;
}
interface Signature {
    scheme: string;
    signature: number[];
}
type Scheme = 'secp256k1' | 'ed25519' | 'Ed25519' | 'Secp256k1';
interface KeyDerivationPath {
    index: number;
    scheme: Scheme;
}
interface Ed25519Signature {
    signature: number[];
}
interface RSVSignature {
    r: string;
    s: string;
    v: number;
}
interface NearNearMpcSignature {
    big_r: {
        affine_point: string;
    };
    s: {
        scalar: string;
    };
    recovery_id: number;
}
interface ChainSigNearMpcSignature {
    big_r: string;
    s: string;
    recovery_id: number;
}
interface ChainSigEvmMpcSignature {
    bigR: {
        x: bigint;
        y: bigint;
    };
    s: bigint;
    recoveryId: number;
}
type MPCSignature = NearNearMpcSignature | ChainSigNearMpcSignature | ChainSigEvmMpcSignature | {
    scheme: Scheme;
} | Ed25519Signature;

declare const ENVS: {
    readonly TESTNET_DEV: "TESTNET_DEV";
    readonly TESTNET: "TESTNET";
    readonly MAINNET: "MAINNET";
};
declare const CHAINS: {
    readonly ETHEREUM: "ETHEREUM";
    readonly NEAR: "NEAR";
};
/**
 * Root public keys for the Sig Network Smart Contracts across different environments.
 *
 * These keys should never change.
 */
declare const ROOT_PUBLIC_KEYS: Record<keyof typeof ENVS, NajPublicKey>;
/**
 * Chain IDs used in the key derivation function (KDF) for deriving child public keys to
 * distinguish between different chains.
 *
 * @see {@link utils.cryptography.deriveChildPublicKey} for usage details
 */
declare const KDF_CHAIN_IDS: {
    readonly ETHEREUM: "0x1";
    readonly NEAR: "0x18d";
};
/**
 * Contract addresses for different chains and environments.
 *
 * - Testnet Dev: Used for internal development, very unstable
 * - Testnet: Used for external development, stable
 * - Mainnet: Production contract address
 *
 * @see ChainSignatureContract documentation for implementation details
 */
declare const CONTRACT_ADDRESSES: Record<keyof typeof CHAINS, Record<keyof typeof ENVS, string>>;

declare const constants_CHAINS: typeof CHAINS;
declare const constants_CONTRACT_ADDRESSES: typeof CONTRACT_ADDRESSES;
declare const constants_ENVS: typeof ENVS;
declare const constants_KDF_CHAIN_IDS: typeof KDF_CHAIN_IDS;
declare const constants_ROOT_PUBLIC_KEYS: typeof ROOT_PUBLIC_KEYS;
declare namespace constants {
  export { constants_CHAINS as CHAINS, constants_CONTRACT_ADDRESSES as CONTRACT_ADDRESSES, constants_ENVS as ENVS, constants_KDF_CHAIN_IDS as KDF_CHAIN_IDS, constants_ROOT_PUBLIC_KEYS as ROOT_PUBLIC_KEYS };
}

declare const toRSV: (signature: MPCSignature) => RSVSignature;
/**
 * Compresses an uncompressed public key to its compressed format following SEC1 standards.
 * In SEC1, a compressed public key consists of a prefix (02 or 03) followed by the x-coordinate.
 * The prefix indicates whether the y-coordinate is even (02) or odd (03).
 *
 * @param uncompressedPubKeySEC1 - The uncompressed public key in hex format, with or without '04' prefix
 * @returns The compressed public key in hex format
 * @throws Error if the uncompressed public key length is invalid
 */
declare const compressPubKey: (uncompressedPubKeySEC1: UncompressedPubKeySEC1) => string;
/**
 * Converts a NAJ public key to an uncompressed SEC1 public key.
 *
 * @param najPublicKey - The NAJ public key to convert (e.g. secp256k1:3Ww8iFjqTHufye5aRGUvrQqETegR4gVUcW8FX5xzscaN9ENhpkffojsxJwi6N1RbbHMTxYa9UyKeqK3fsMuwxjR5)
 * @returns The uncompressed SEC1 public key (e.g. 04 || x || y)
 */
declare const najToUncompressedPubKeySEC1: (najPublicKey: NajPublicKey) => UncompressedPubKeySEC1;
/**
 * Derives a child public key from a parent public key using the sig.network v1.0.0 epsilon derivation scheme.
 * The parent public keys are defined in @constants.ts
 *
 * @param rootUncompressedPubKeySEC1 - The parent public key in uncompressed SEC1 format (e.g. 04 || x || y)
 * @param predecessorId - The predecessor ID is the address of the account calling the signer contract (e.g EOA or Contract Address)
 * @param path - Optional derivation path suffix (defaults to empty string)
 * @param chainId - The chain ID for key derivation
 * @returns The derived child public key in uncompressed SEC1 format (04 || x || y)
 */
declare function deriveChildPublicKey(rootUncompressedPubKeySEC1: UncompressedPubKeySEC1, predecessorId: string, path: string | undefined, chainId: string): UncompressedPubKeySEC1;
/**
 * Converts a Uint8Array to a hexadecimal string.
 *
 * @param uint8Array - The Uint8Array to convert.
 * @returns The hexadecimal string representation of the Uint8Array.
 */
declare const uint8ArrayToHex: (uint8Array: number[] | Uint8Array<ArrayBufferLike>) => string;

declare const cryptography_compressPubKey: typeof compressPubKey;
declare const cryptography_deriveChildPublicKey: typeof deriveChildPublicKey;
declare const cryptography_najToUncompressedPubKeySEC1: typeof najToUncompressedPubKeySEC1;
declare const cryptography_toRSV: typeof toRSV;
declare const cryptography_uint8ArrayToHex: typeof uint8ArrayToHex;
declare namespace cryptography {
  export { cryptography_compressPubKey as compressPubKey, cryptography_deriveChildPublicKey as deriveChildPublicKey, cryptography_najToUncompressedPubKeySEC1 as najToUncompressedPubKeySEC1, cryptography_toRSV as toRSV, cryptography_uint8ArrayToHex as uint8ArrayToHex };
}

declare const index$a_cryptography: typeof cryptography;
declare namespace index$a {
  export { index$a_cryptography as cryptography };
}

declare abstract class ChainAdapter<TransactionRequest, UnsignedTransaction> {
    /**
     * Gets the native token balance and decimals for a given address
     *
     * @param address - The address to check
     * @returns Promise resolving to an object containing:
     *          - balance: The balance as a bigint, in the chain's base units
     *          - decimals: The number of decimals used to format the balance
     */
    abstract getBalance(address: string): Promise<{
        balance: bigint;
        decimals: number;
    }>;
    /**
     * Uses Sig Network Key Derivation Function to derive the address and public key. from a signer ID and string path.
     *
     * @param predecessor - The id/address of the account requesting signature
     * @param path - The string path used to derive the key
     * @returns Promise resolving to the derived address and public key
     */
    abstract deriveAddressAndPublicKey(predecessor: string, path: string): Promise<{
        address: string;
        publicKey: string;
    }>;
    /**
     * Serializes an unsigned transaction to a string format.
     * This is useful for storing or transmitting the transaction.
     *
     * @param transaction - The unsigned transaction to serialize
     * @returns The serialized transaction string
     */
    abstract serializeTransaction(transaction: UnsignedTransaction): string;
    /**
     * Deserializes a transaction string back into an unsigned transaction object.
     * This reverses the serialization done by serializeTransaction().
     *
     * @param serialized - The serialized transaction string
     * @returns The deserialized unsigned transaction
     */
    abstract deserializeTransaction(serialized: string): UnsignedTransaction;
    /**
     * Prepares a transaction for Sig Network MPC signing by creating the necessary payloads.
     * This method handles chain-specific transaction preparation including:
     * - Fee calculation
     * - Nonce/sequence management
     * - UTXO selection (for UTXO-based chains)
     * - Transaction encoding
     *
     * @param transactionRequest - The transaction request containing parameters like recipient, amount, etc.
     * @returns Promise resolving to an object containing:
     *          - transaction: The unsigned transaction
     *          - hashesToSign: Array of payloads to be signed by MPC. The order of these payloads must match
     *                         the order of signatures provided to finalizeTransactionSigning()
     */
    abstract prepareTransactionForSigning(transactionRequest: TransactionRequest): Promise<{
        transaction: UnsignedTransaction;
        hashesToSign: HashToSign[];
    }>;
    /**
     * Adds Sig Network MPC-generated signatures to an unsigned transaction.
     *
     * @param params - Parameters for adding signatures
     * @param params.transaction - The unsigned transaction to add signatures to
     * @param params.rsvSignatures - Array of RSV signatures generated through MPC. Must be in the same order
     *                              as the payloads returned by prepareTransactionForSigning()
     * @returns The serialized signed transaction ready for broadcast
     */
    abstract finalizeTransactionSigning(params: {
        transaction: UnsignedTransaction | Transaction$1;
        rsvSignatures: RSVSignature[] | Signature;
    }): string;
    /**
     * Broadcasts a signed transaction to the network.
     *
     * @param txSerialized - The serialized signed transaction
     * @returns Promise resolving to an object containing the transaction hash/ID
     */
    abstract broadcastTx(txSerialized: string): Promise<{
        hash: string;
    }>;
}

/**
 * Implementation of the ChainAdapter interface for EVM-compatible networks.
 * Handles interactions with Ethereum Virtual Machine based blockchains like Ethereum, BSC, Polygon, etc.
 */
declare class EVM extends ChainAdapter<EVMTransactionRequest, EVMUnsignedTransaction> {
    private readonly client;
    private readonly contract;
    /**
     * Creates a new EVM chain instance
     * @param params - Configuration parameters
     * @param params.publicClient - A Viem PublicClient instance for reading from the blockchain
     * @param params.contract - Instance of the chain signature contract for MPC operations
     */
    constructor({ publicClient, contract, }: {
        publicClient: PublicClient;
        contract: ChainSignatureContract;
    });
    private attachGasAndNonce;
    private attachGasAndNonceLegacy;
    private transformRSVSignature;
    private assembleSignature;
    deriveAddressAndPublicKey(predecessor: string, path: string): Promise<{
        address: string;
        publicKey: string;
    }>;
    getBalance(address: string): Promise<{
        balance: bigint;
        decimals: number;
    }>;
    serializeTransaction(transaction: EVMUnsignedTransaction): `0x${string}`;
    deserializeTransaction(serialized: `0x${string}`): EVMUnsignedTransaction;
    prepareTransactionForSigning(transactionRequest: EVMTransactionRequest): Promise<{
        transaction: EVMUnsignedTransaction;
        hashesToSign: HashToSign[];
    }>;
    prepareTransactionForSigningLegacy(transactionRequest: EVMTransactionRequestLegacy): Promise<{
        transaction: EVMUnsignedLegacyTransaction;
        hashesToSign: HashToSign[];
    }>;
    prepareMessageForSigning(message: EVMMessage): Promise<{
        hashToSign: HashToSign;
    }>;
    prepareTypedDataForSigning(typedDataRequest: EVMTypedData): Promise<{
        hashToSign: HashToSign;
    }>;
    /**
     * This implementation is a common step for Biconomy and Alchemy.
     * Key differences between implementations:
     * - Signature format: Biconomy omits 0x00 prefix when concatenating, Alchemy includes it
     * - Version support: Biconomy only supports v6, Alchemy supports both v6 and v7
     * - Validation: Biconomy uses modules for signature validation, Alchemy uses built-in validation
     */
    prepareUserOpForSigning(userOp: UserOperationV7 | UserOperationV6, entryPointAddress?: Address, chainIdArgs?: number): Promise<{
        userOp: UserOperationV7 | UserOperationV6;
        hashToSign: HashToSign;
    }>;
    prepareAuthorizationForSigning(params: EVMAuthorizationRequest): {
        hashToSign: HashToSign;
    };
    finalizeTransactionSigning({ transaction, rsvSignatures, }: {
        transaction: EVMUnsignedTransaction;
        rsvSignatures: RSVSignature[];
    }): `0x02${string}`;
    finalizeTransactionSigningLegacy({ transaction, rsvSignatures, }: {
        transaction: EVMUnsignedLegacyTransaction;
        rsvSignatures: RSVSignature[];
    }): `0x${string}`;
    finalizeMessageSigning({ rsvSignature, }: {
        rsvSignature: RSVSignature;
    }): Hex;
    finalizeTypedDataSigning({ rsvSignature, }: {
        rsvSignature: RSVSignature;
    }): Hex;
    finalizeUserOpSigning({ userOp, rsvSignature, }: {
        userOp: UserOperationV7 | UserOperationV6;
        rsvSignature: RSVSignature;
    }): UserOperationV7 | UserOperationV6;
    finalizeAuthorizationSigning(params: {
        authorization: EVMAuthorizationRequest;
        rsvSignature: RSVSignature;
    }): SignedAuthorization;
    broadcastTx(txSerialized: string): Promise<{
        hash: Hash;
    }>;
}

interface EVMFeeProperties {
    gas: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
}
declare function fetchEVMFeeProperties(client: PublicClient, transaction: TransactionRequest): Promise<EVMFeeProperties>;

type index$9_EVM = EVM;
declare const index$9_EVM: typeof EVM;
type index$9_EVMAuthorizationRequest = EVMAuthorizationRequest;
type index$9_EVMFeeProperties = EVMFeeProperties;
type index$9_EVMMessage = EVMMessage;
type index$9_EVMTransactionRequest = EVMTransactionRequest;
type index$9_EVMTransactionRequestLegacy = EVMTransactionRequestLegacy;
type index$9_EVMTypedData = EVMTypedData;
type index$9_EVMUnsignedLegacyTransaction = EVMUnsignedLegacyTransaction;
type index$9_EVMUnsignedTransaction = EVMUnsignedTransaction;
type index$9_UserOperationV6 = UserOperationV6;
type index$9_UserOperationV7 = UserOperationV7;
declare const index$9_fetchEVMFeeProperties: typeof fetchEVMFeeProperties;
declare namespace index$9 {
  export { index$9_EVM as EVM, type index$9_EVMAuthorizationRequest as EVMAuthorizationRequest, type index$9_EVMFeeProperties as EVMFeeProperties, type index$9_EVMMessage as EVMMessage, type index$9_EVMTransactionRequest as EVMTransactionRequest, type index$9_EVMTransactionRequestLegacy as EVMTransactionRequestLegacy, type index$9_EVMTypedData as EVMTypedData, type index$9_EVMUnsignedLegacyTransaction as EVMUnsignedLegacyTransaction, type index$9_EVMUnsignedTransaction as EVMUnsignedTransaction, type index$9_UserOperationV6 as UserOperationV6, type index$9_UserOperationV7 as UserOperationV7, index$9_fetchEVMFeeProperties as fetchEVMFeeProperties };
}

declare abstract class BTCRpcAdapter {
    abstract selectUTXOs(from: string, targets: BTCOutput[]): Promise<{
        inputs: BTCInput[];
        outputs: BTCOutput[];
    }>;
    abstract broadcastTransaction(transactionHex: string): Promise<string>;
    abstract getBalance(address: string): Promise<number>;
    abstract getTransaction(txid: string): Promise<BTCTransaction>;
}

declare class Mempool extends BTCRpcAdapter {
    private readonly providerUrl;
    constructor(providerUrl: string);
    private fetchFeeRate;
    private fetchUTXOs;
    selectUTXOs(from: string, targets: BTCOutput[], confirmationTarget?: number): Promise<{
        inputs: BTCInput[];
        outputs: BTCOutput[];
    }>;
    broadcastTransaction(transactionHex: string): Promise<string>;
    getBalance(address: string): Promise<number>;
    getTransaction(txid: string): Promise<BTCTransaction>;
}

declare const BTCRpcAdapters: {
    Mempool: typeof Mempool;
};

/**
 * Implementation of the ChainAdapter interface for Bitcoin network.
 * Handles interactions with both Bitcoin mainnet and testnet, supporting P2WPKH transactions.
 */
declare class Bitcoin extends ChainAdapter<BTCTransactionRequest, BTCUnsignedTransaction> {
    private static readonly SATOSHIS_PER_BTC;
    private readonly network;
    private readonly btcRpcAdapter;
    private readonly contract;
    /**
     * Creates a new Bitcoin chain instance
     * @param params - Configuration parameters
     * @param params.network - Network identifier (mainnet/testnet)
     * @param params.contract - Instance of the chain signature contract for MPC operations
     * @param params.btcRpcAdapter - Bitcoin RPC adapter for network interactions
     */
    constructor({ network, contract, btcRpcAdapter, }: {
        network: BTCNetworkIds;
        contract: ChainSignatureContract;
        btcRpcAdapter: BTCRpcAdapter;
    });
    /**
     * Converts satoshis to BTC
     * @param satoshis - Amount in satoshis
     * @returns Amount in BTC
     */
    static toBTC(satoshis: number): number;
    /**
     * Converts BTC to satoshis
     * @param btc - Amount in BTC
     * @returns Amount in satoshis (rounded)
     */
    static toSatoshi(btc: number): number;
    private fetchTransaction;
    private static transformRSVSignature;
    /**
     * Creates a Partially Signed Bitcoin Transaction (PSBT)
     * @param params - Parameters for creating the PSBT
     * @param params.transactionRequest - Transaction request containing inputs and outputs
     * @returns Created PSBT instance
     */
    createPSBT({ transactionRequest, }: {
        transactionRequest: BTCTransactionRequest;
    }): Promise<bitcoin.Psbt>;
    getBalance(address: string): Promise<{
        balance: bigint;
        decimals: number;
    }>;
    deriveAddressAndPublicKey(predecessor: string, path: string): Promise<{
        address: string;
        publicKey: string;
    }>;
    serializeTransaction(transaction: BTCUnsignedTransaction): string;
    deserializeTransaction(serialized: string): BTCUnsignedTransaction;
    prepareTransactionForSigning(transactionRequest: BTCTransactionRequest): Promise<{
        transaction: BTCUnsignedTransaction;
        hashesToSign: HashToSign[];
    }>;
    finalizeTransactionSigning({ transaction: { psbt, publicKey }, rsvSignatures, }: {
        transaction: BTCUnsignedTransaction;
        rsvSignatures: RSVSignature[];
    }): string;
    broadcastTx(txSerialized: string): Promise<{
        hash: string;
    }>;
}

type index$8_BTCInput = BTCInput;
type index$8_BTCNetworkIds = BTCNetworkIds;
type index$8_BTCOutput = BTCOutput;
type index$8_BTCRpcAdapter = BTCRpcAdapter;
declare const index$8_BTCRpcAdapter: typeof BTCRpcAdapter;
declare const index$8_BTCRpcAdapters: typeof BTCRpcAdapters;
type index$8_BTCTransaction = BTCTransaction;
type index$8_BTCTransactionRequest = BTCTransactionRequest;
type index$8_BTCUnsignedTransaction = BTCUnsignedTransaction;
type index$8_Bitcoin = Bitcoin;
declare const index$8_Bitcoin: typeof Bitcoin;
type index$8_Mempool = Mempool;
declare const index$8_Mempool: typeof Mempool;
declare namespace index$8 {
  export { type index$8_BTCInput as BTCInput, type index$8_BTCNetworkIds as BTCNetworkIds, type index$8_BTCOutput as BTCOutput, index$8_BTCRpcAdapter as BTCRpcAdapter, index$8_BTCRpcAdapters as BTCRpcAdapters, type index$8_BTCTransaction as BTCTransaction, type index$8_BTCTransactionRequest as BTCTransactionRequest, type index$8_BTCUnsignedTransaction as BTCUnsignedTransaction, index$8_Bitcoin as Bitcoin, index$8_Mempool as Mempool };
}

/**
 * Implementation of the ChainAdapter interface for Cosmos-based networks.
 * Handles interactions with Cosmos SDK chains like Cosmos Hub, Osmosis, etc.
 */
declare class Cosmos extends ChainAdapter<CosmosTransactionRequest, CosmosUnsignedTransaction> {
    private readonly registry;
    private readonly chainId;
    private readonly contract;
    private readonly endpoints?;
    /**
     * Creates a new Cosmos chain instance
     * @param params - Configuration parameters
     * @param params.chainId - Chain id for the Cosmos network
     * @param params.contract - Instance of the chain signature contract for MPC operations
     * @param params.endpoints - Optional RPC and REST endpoints
     * @param params.endpoints.rpcUrl - Optional RPC endpoint URL
     * @param params.endpoints.restUrl - Optional REST endpoint URL
     */
    constructor({ chainId, contract, endpoints, }: {
        contract: ChainSignatureContract;
        chainId: CosmosNetworkIds;
        endpoints?: {
            rpcUrl?: string;
            restUrl?: string;
        };
    });
    private transformRSVSignature;
    private getChainInfo;
    getBalance(address: string): Promise<{
        balance: bigint;
        decimals: number;
    }>;
    deriveAddressAndPublicKey(predecessor: string, path: string): Promise<{
        address: string;
        publicKey: string;
    }>;
    serializeTransaction(transaction: CosmosUnsignedTransaction): string;
    deserializeTransaction(serialized: string): CosmosUnsignedTransaction;
    prepareTransactionForSigning(transactionRequest: CosmosTransactionRequest): Promise<{
        transaction: CosmosUnsignedTransaction;
        hashesToSign: HashToSign[];
    }>;
    finalizeTransactionSigning({ transaction, rsvSignatures, }: {
        transaction: CosmosUnsignedTransaction;
        rsvSignatures: RSVSignature[];
    }): string;
    broadcastTx(txSerialized: string): Promise<string>;
}

type index$7_Cosmos = Cosmos;
declare const index$7_Cosmos: typeof Cosmos;
type index$7_CosmosNetworkIds = CosmosNetworkIds;
type index$7_CosmosTransactionRequest = CosmosTransactionRequest;
type index$7_CosmosUnsignedTransaction = CosmosUnsignedTransaction;
declare namespace index$7 {
  export { index$7_Cosmos as Cosmos, type index$7_CosmosNetworkIds as CosmosNetworkIds, type index$7_CosmosTransactionRequest as CosmosTransactionRequest, type index$7_CosmosUnsignedTransaction as CosmosUnsignedTransaction };
}

interface SolanaTransactionRequest {
    from: string;
    to: string;
    amount: bigint | BN;
    instructions?: TransactionInstruction[];
    feePayer?: PublicKey;
}
interface SolanaUnsignedTransaction {
    transaction: Transaction$1;
    feePayer: PublicKey;
    recentBlockhash: string;
}

declare class Solana extends ChainAdapter<SolanaTransactionRequest, SolanaUnsignedTransaction> {
    private readonly connection;
    private readonly contract;
    constructor(args: {
        solanaConnection: Connection;
        contract: ChainSignatureContract;
    });
    getBalance(address: string): Promise<{
        balance: bigint;
        decimals: number;
    }>;
    deriveAddressAndPublicKey(predecessor: string, path: string): Promise<{
        address: string;
        publicKey: string;
    }>;
    serializeTransaction(transaction: SolanaUnsignedTransaction): string;
    deserializeTransaction(serialized: string): SolanaUnsignedTransaction;
    prepareTransactionForSigning(request: SolanaTransactionRequest): Promise<{
        transaction: SolanaUnsignedTransaction;
        hashesToSign: HashToSign[];
    }>;
    finalizeTransactionSigning({ transaction, rsvSignatures, senderAddress, }: {
        transaction: Transaction$1;
        rsvSignatures: Signature;
        senderAddress: string;
    }): string;
    broadcastTx(txSerialized: string): Promise<{
        hash: string;
    }>;
}

type index$6_Solana = Solana;
declare const index$6_Solana: typeof Solana;
type index$6_SolanaTransactionRequest = SolanaTransactionRequest;
type index$6_SolanaUnsignedTransaction = SolanaUnsignedTransaction;
declare namespace index$6 {
  export { index$6_Solana as Solana, type index$6_SolanaTransactionRequest as SolanaTransactionRequest, type index$6_SolanaUnsignedTransaction as SolanaUnsignedTransaction };
}

declare const responseToMpcSignature: ({ signature, }: {
    signature: MPCSignature;
}) => RSVSignature | Ed25519Signature | undefined;

declare const transaction_responseToMpcSignature: typeof responseToMpcSignature;
declare namespace transaction {
  export { transaction_responseToMpcSignature as responseToMpcSignature };
}

declare const utils$1: {
    transaction: typeof transaction;
};

type index$5_ChainSignatureContract = ChainSignatureContract;
declare const index$5_ChainSignatureContract: typeof ChainSignatureContract;
type index$5_HashToSign = HashToSign;
type index$5_SignArgs = SignArgs;
declare namespace index$5 {
  export { index$5_ChainSignatureContract as ChainSignatureContract, type index$5_HashToSign as HashToSign, type index$5_SignArgs as SignArgs, utils$1 as utils };
}

declare class Aptos extends ChainAdapter<AnyRawTransaction, AnyRawTransaction> {
    private readonly contract;
    private readonly client;
    /**
     * Creates a new Aptos chain instance
     * @param params - Configuration parameters
     * @param params.client - A Aptos client instance to interact with the blockchain
     * @param params.contract - Instance of the chain signature contract for MPC operations
     */
    constructor({ contract, client, }: {
        contract: ChainSignatureContract;
        client: Aptos$1;
    });
    getBalance(address: string): Promise<{
        balance: bigint;
        decimals: number;
    }>;
    deriveAddressAndPublicKey(predecessor: string, path: string): Promise<{
        address: string;
        publicKey: string;
    }>;
    serializeTransaction(transaction: AnyRawTransaction): string;
    deserializeTransaction(serialized: string): MultiAgentTransaction | SimpleTransaction;
    prepareTransactionForSigning(transactionRequest: AnyRawTransaction): Promise<{
        transaction: AnyRawTransaction;
        hashesToSign: HashToSign[];
    }>;
    rsvSignatureToSenderAuthenticator(params: {
        rsvSignatures: Signature;
        publicKey: string;
    }): AccountAuthenticatorEd25519;
    finalizeTransactionSigning(params: {
        transaction: AnyRawTransaction;
        rsvSignatures: Signature;
        publicKey: string;
        additionalSignersAuthenticators?: AccountAuthenticator[];
        feePayerAuthenticator?: AccountAuthenticator;
    }): string;
    private deserializeSignedTransaction;
    broadcastTx(txSerialized: string): Promise<{
        hash: string;
    }>;
}

type index$4_Aptos = Aptos;
declare const index$4_Aptos: typeof Aptos;
declare namespace index$4 {
  export { index$4_Aptos as Aptos };
}

type SUIUnsignedTransaction = Uint8Array<ArrayBufferLike>;
type SUITransactionRequest = Transaction$2;

declare class SUI extends ChainAdapter<SUITransactionRequest, SUIUnsignedTransaction> {
    private readonly contract;
    private readonly client;
    private readonly transport;
    /**
     * Creates a new SUI chain instance
     * @param params - Configuration parameters
     * @param params.client - A SUI client instance to interact with the blockchain
     * @param params.contract - Instance of the chain signature contract for MPC operations
     */
    constructor({ contract, client, rpcUrl, }: {
        contract: ChainSignatureContract;
        client: SuiClient;
        rpcUrl: string;
    });
    getBalance(address: string): Promise<{
        balance: bigint;
        decimals: number;
    }>;
    deriveAddressAndPublicKey(predecessor: string, path: string): Promise<{
        address: string;
        publicKey: string;
    }>;
    serializeTransaction(transaction: Uint8Array<ArrayBufferLike>): string;
    deserializeTransaction(serialized: string): Uint8Array<ArrayBufferLike>;
    prepareTransactionForSigning(transactionRequest: Transaction$2): Promise<{
        transaction: Uint8Array<ArrayBufferLike>;
        hashesToSign: HashToSign[];
    }>;
    rsvSignatureToSuiSignature(params: {
        transaction: Uint8Array<ArrayBufferLike>;
        rsvSignatures: Signature;
        publicKey: string;
    }): string;
    finalizeTransactionSigning(params: {
        transaction: Uint8Array<ArrayBufferLike>;
        rsvSignatures: Signature;
        publicKey: string;
    }): string;
    broadcastTx(txSerialized: string): Promise<{
        hash: string;
    }>;
}

type index$3_SUI = SUI;
declare const index$3_SUI: typeof SUI;
type index$3_SUITransactionRequest = SUITransactionRequest;
type index$3_SUIUnsignedTransaction = SUIUnsignedTransaction;
declare namespace index$3 {
  export { index$3_SUI as SUI, type index$3_SUITransactionRequest as SUITransactionRequest, type index$3_SUIUnsignedTransaction as SUIUnsignedTransaction };
}

interface XRPTransactionRequest {
    from: string;
    to: string;
    amount: string;
    destinationTag?: number;
    memo?: string;
    fee?: string;
    sequence?: number;
    publicKey: string;
}
interface XRPUnsignedTransaction {
    transaction: {
        Account: string;
        Destination: string;
        Amount: string;
        TransactionType: string;
        Fee: string;
        Sequence: number;
        DestinationTag?: number;
        Memos?: Array<{
            Memo: {
                MemoData?: string;
                MemoType?: string;
                MemoFormat?: string;
            };
        }>;
        LastLedgerSequence?: number;
        SigningPubKey: string;
        Flags?: number;
        NetworkID?: number;
    };
    signingPubKey: string;
}

/**
 * XRP Ledger chain adapter implementation
 *
 * Provides functionality to interact with the XRP Ledger blockchain including
 * balance queries, address derivation, transaction preparation, signing, and broadcasting.
 */
declare class XRP extends ChainAdapter<XRPTransactionRequest, XRPUnsignedTransaction> {
    private readonly rpcUrl;
    private readonly contract;
    private readonly client;
    /**
     * Creates a new XRP chain adapter instance
     *
     * @param params - Configuration parameters
     * @param params.rpcUrl - XRP Ledger RPC endpoint URL
     * @param params.contract - Instance of the chain signature contract for MPC operations
     * @param params.client - Optional XRPL client instance (for testing)
     */
    constructor({ rpcUrl, contract, client, }: {
        rpcUrl: string;
        contract: ChainSignatureContract;
        client?: Client;
    });
    /**
     * Retrieves the XRP balance for a given address
     *
     * @param address - The XRP address to query
     * @returns Promise resolving to balance information with amount in drops and decimal places
     * @throws Error if the balance query fails for reasons other than account not found
     */
    getBalance(address: string): Promise<{
        balance: bigint;
        decimals: number;
    }>;
    /**
     * Derives an XRP address and compressed public key from the given path and predecessor
     *
     * @param predecessor - The predecessor for key derivation
     * @param path - The derivation path
     * @returns Promise resolving to the derived address and compressed public key
     * @throws Error if public key derivation fails
     */
    deriveAddressAndPublicKey(predecessor: string, path: string): Promise<{
        address: string;
        publicKey: string;
    }>;
    /**
     * Derives an XRP address from a compressed secp256k1 public key
     *
     * @param publicKeyHex - The compressed secp256k1 public key in hex format (66 chars: 02/03 + 64)
     * @returns The XRP address encoded using ripple-address-codec
     */
    private deriveXRPAddress;
    /**
     * Serializes an XRP unsigned transaction to a JSON string
     *
     * @param transaction - The unsigned transaction to serialize
     * @returns JSON string representation of the transaction
     */
    serializeTransaction(transaction: XRPUnsignedTransaction): string;
    /**
     * Deserializes a JSON string back to an XRP unsigned transaction
     *
     * @param serialized - The JSON string to deserialize
     * @returns The deserialized unsigned transaction
     */
    deserializeTransaction(serialized: string): XRPUnsignedTransaction;
    /**
     * Prepares an XRP transaction for signing by autofilling required fields and generating signing hash
     *
     * @param transactionRequest - The transaction request containing payment details
     * @returns Promise resolving to the prepared unsigned transaction and hash to sign
     * @throws Error if transaction preparation fails
     */
    prepareTransactionForSigning(transactionRequest: XRPTransactionRequest): Promise<{
        transaction: XRPUnsignedTransaction;
        hashesToSign: HashToSign[];
    }>;
    /**
     * Finalizes transaction signing by applying RSV signatures to the prepared transaction
     *
     * @param params - Object containing the unsigned transaction and RSV signatures
     * @param params.transaction - The unsigned transaction to sign
     * @param params.rsvSignatures - Array of RSV signatures (only first signature is used)
     * @returns JSON string of the signed transaction ready for broadcast
     * @throws Error if no signatures are provided
     */
    finalizeTransactionSigning({ transaction, rsvSignatures, }: {
        transaction: XRPUnsignedTransaction;
        rsvSignatures: RSVSignature[];
    }): string;
    /**
     * Generates a DER-encoded transaction signature from RSV signature components
     *
     * @param r - The R component of the signature in hex
     * @param s - The S component of the signature in hex
     * @param v - The V component of the signature (recovery ID)
     * @returns DER-encoded signature in uppercase hex format
     */
    generateTxnSignature(r: string, s: string, v: number): string;
    /**
     * Broadcasts a signed XRP transaction to the network
     *
     * @param txSerialized - JSON string of the signed transaction
     * @returns Promise resolving to the transaction hash
     * @throws Error if transaction submission fails or is rejected by the network
     */
    broadcastTx(txSerialized: string): Promise<{
        hash: string;
    }>;
}

type index$2_XRP = XRP;
declare const index$2_XRP: typeof XRP;
type index$2_XRPTransactionRequest = XRPTransactionRequest;
type index$2_XRPUnsignedTransaction = XRPUnsignedTransaction;
declare namespace index$2 {
  export { index$2_XRP as XRP, type index$2_XRPTransactionRequest as XRPTransactionRequest, type index$2_XRPUnsignedTransaction as XRPUnsignedTransaction };
}

interface NearTransactionRequest {
    from: string;
    to: string;
    amount: bigint;
    publicKey: string;
    memo?: string;
}
interface NearUnsignedTransaction {
    transaction: Transaction$3;
}

declare class NEAR extends ChainAdapter<NearTransactionRequest, NearUnsignedTransaction> {
    private readonly provider;
    private readonly contract;
    private readonly networkId;
    constructor(args: {
        rpcUrl: string;
        networkId: 'mainnet' | 'testnet';
        contract: ChainSignatureContract;
    });
    private isAccountDoesNotExistError;
    getBalance(address: string): Promise<{
        balance: bigint;
        decimals: number;
    }>;
    deriveAddressAndPublicKey(predecessor: string, path: string): Promise<{
        address: string;
        publicKey: string;
    }>;
    serializeTransaction(unsigned: NearUnsignedTransaction): string;
    deserializeTransaction(serialized: string): NearUnsignedTransaction;
    prepareTransactionForSigning(request: NearTransactionRequest): Promise<{
        transaction: NearUnsignedTransaction;
        hashesToSign: HashToSign[];
    }>;
    finalizeTransactionSigning({ transaction, rsvSignatures }: {
        transaction: NearUnsignedTransaction | Transaction$1;
        rsvSignatures: RSVSignature[] | Signature;
    }): string;
    broadcastTx(txSerialized: string): Promise<{
        hash: string;
    }>;
}

interface EnsureDerivedAccountParams {
    provider: JsonRpcProvider;
    controllerAccountId: string;
    controllerKeyPair: KeyPair;
    derivedAccountId: string;
    mpcPublicKey: string;
    initialDepositYocto: bigint;
}
declare function ensureDerivedAccountExists(params: EnsureDerivedAccountParams): Promise<{
    created: boolean;
}>;

type utils_EnsureDerivedAccountParams = EnsureDerivedAccountParams;
declare const utils_ensureDerivedAccountExists: typeof ensureDerivedAccountExists;
declare namespace utils {
  export { type utils_EnsureDerivedAccountParams as EnsureDerivedAccountParams, utils_ensureDerivedAccountExists as ensureDerivedAccountExists };
}

type index$1_NEAR = NEAR;
declare const index$1_NEAR: typeof NEAR;
type index$1_NearTransactionRequest = NearTransactionRequest;
type index$1_NearUnsignedTransaction = NearUnsignedTransaction;
declare const index$1_utils: typeof utils;
declare namespace index$1 {
  export { index$1_NEAR as NEAR, type index$1_NearTransactionRequest as NearTransactionRequest, type index$1_NearUnsignedTransaction as NearUnsignedTransaction, index$1_utils as utils };
}

type index_ChainAdapter<TransactionRequest, UnsignedTransaction> = ChainAdapter<TransactionRequest, UnsignedTransaction>;
declare const index_ChainAdapter: typeof ChainAdapter;
declare namespace index {
  export { index_ChainAdapter as ChainAdapter, index$4 as aptos, index$8 as btc, index$7 as cosmos, index$9 as evm, index$1 as near, index$6 as solana, index$3 as sui, index$2 as xrp };
}

export { type Base58String, type ChainSigEvmMpcSignature, type ChainSigNearMpcSignature, type CompressedPubKeySEC1, type DerivedPublicKeyArgs, type Ed25519PubKey, type Ed25519Signature, type HashToSign, type KeyDerivationPath, type MPCSignature, type NajPublicKey, type NearNearMpcSignature, type RSVSignature, type Scheme, type Signature, type UncompressedPubKeySEC1, index as chainAdapters, constants, index$5 as contracts, index$a as utils };
