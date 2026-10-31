import { bench, describe } from "vitest";
import { encodeBase64Url, decodeCanonicalBase64Url, encodeUtf8 } from "../../src/encoding.js";

const payload = new Uint8Array(256).fill(0xAA);
const base64UrlPayload = encodeBase64Url(payload);
const utf8String = "A".repeat(1024);

describe("encoding throughput and memory footprint", () => {
  bench("encodeBase64Url", () => {
    encodeBase64Url(payload);
  });

  bench("decodeCanonicalBase64Url", () => {
    decodeCanonicalBase64Url(base64UrlPayload, 256);
  });

  bench("encodeUtf8", () => {
    encodeUtf8(utf8String);
  });
});
