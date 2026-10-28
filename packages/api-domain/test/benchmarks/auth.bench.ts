import { bench, describe } from "vitest";
import { authenticateCredential } from "../../src/auth.js";
import { CredentialService, CredentialLookupPort, CredentialCandidate } from "../../src/types.js";

const mockCredentials: CredentialService = {
  inspect: async (token) => ({ publicTokenId: "some_public_id_0000" }),
  verify: async () => true,
  issue: async () => { throw new Error("not implemented") },
  deriveSuppressionMarker: async () => { throw new Error("not implemented") }
};

const mockLookup: CredentialLookupPort = {
  findCredentialCandidate: async () => ({
    installationId: "ins_1234567890abcdef",
    credential: {
      publicTokenId: "some_public_id_0000",
      hmacDigest: "some_digest_0000"
    }
  })
};

describe("auth throughput lookup benchmark", () => {
  const token = "tm_u2_some_public_id_0000.some_secret_0000";

  bench("authenticateCredential", async () => {
    await authenticateCredential(token, "upload", mockCredentials, mockLookup);
  });
});
