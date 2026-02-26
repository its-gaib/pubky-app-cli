import { Pubky, Keypair, PublicKey } from "@synonymdev/pubky";
import { PubkySpecsBuilder } from "pubky-app-specs";
import * as bip39 from "bip39";
import { loadConfig } from "./config";

export interface ClientContext {
  session: any;
  specs: any;
  pubky: any;
  publicKey: any;
  z32: string;
}

function seedToKeypair(seed: string): any {
  if (!bip39.validateMnemonic(seed)) {
    throw new Error("Invalid BIP39 mnemonic seed phrase");
  }
  const seedBytes = bip39.mnemonicToSeedSync(seed);
  const secret32 = new Uint8Array(seedBytes.subarray(0, 32));
  return Keypair.fromSecret(secret32);
}

export async function withSession<T>(
  fn: (ctx: ClientContext) => Promise<T>
): Promise<T> {
  const config = loadConfig();
  const keypair = seedToKeypair(config.seed);
  const z32 = keypair.publicKey.z32();
  const pubky = new Pubky();
  const signer = pubky.signer(keypair);

  const session = await signer.signin();

  const specs = new PubkySpecsBuilder(z32);

  try {
    return await fn({
      session,
      specs,
      pubky,
      publicKey: keypair.publicKey,
      z32,
    });
  } finally {
    try {
      await session.signout();
    } catch {
      // ignore signout errors
    }
  }
}

export async function withPublicAccess<T>(
  fn: (ctx: { pubky: any; publicStorage: any }) => Promise<T>
): Promise<T> {
  const pubky = new Pubky();
  return await fn({ pubky, publicStorage: pubky.publicStorage });
}

export function getPublicKeyZ32(): string {
  const config = loadConfig();
  const keypair = seedToKeypair(config.seed);
  return keypair.publicKey.z32();
}
