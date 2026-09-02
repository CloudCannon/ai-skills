# Constructing the client

One class, one constructor, and a config object you build yourself.

```js
import CloudCannonClient from "@cloudcannon/sdk";

const client = new CloudCannonClient({ key: apiKey });
```

## The SDK reads no credentials of its own

**MUST supply credentials in the constructor.** The SDK does not read `auth.json`, does not read `CC_ACCESS_KEY_ID` or `CLOUDCANNON_API_KEY`, and has no fallback chain. A client constructed without `key` or `userAccessKey` sends no usable auth header and fails at request time.

**Why:** the credential chain an agent has seen at the command line is implemented in the CLI, not in the SDK — the CLI resolves a credential, then hands the SDK a finished config object. Assuming the SDK inherits that behaviour is the most common way SDK code fails on the first call.

Reading the environment in your own code is fine and normal; it is your code doing it, not the SDK:

```js
const client = new CloudCannonClient({
  userAccessKey: {
    id: process.env.CC_ACCESS_KEY_ID,
    secret: process.env.CC_ACCESS_KEY_SECRET,
  },
});
```

**MUST assert the variables you depend on** rather than passing `undefined` through. An incomplete key pair produces an authentication failure at request time, not a constructor error.

For where these keys come from, what shape they take, how `cloudcannon login` stores them, and how to set them in CI, see [`cloudcannon-cli/authentication.md`](../cloudcannon-cli/authentication.md) — it owns all of that, and it is the same credential either way.

**MUST NOT read, print, echo, or copy a credential value.** The rules for an agent handling credentials do not change between the CLI and the SDK: [`cloudcannon-cli/authentication.md` § Handling credentials as an agent](../cloudcannon-cli/authentication.md#handling-credentials-as-an-agent).

## The two credential shapes

| Shape           | Config                              | How it authenticates                     | Use for                      |
| --------------- | ----------------------------------- | ---------------------------------------- | ---------------------------- |
| API key         | `{ key: '<api key>' }`              | An `X-API-KEY` header                    | Scoped automation            |
| User access key | `{ userAccessKey: { id, secret } }` | HMAC-SHA256 request signing, per request | Acting as a person's account |

Exactly one is required — the config type is a union, so TypeScript rejects both and neither.

**A signed request is signed over its body.** The `userAccessKey` path derives a fresh signature per request from the URL, the body, a timestamp, and a nonce, so nothing about the credential is cacheable per-request and a captured signature is not replayable. Nothing needs doing about this — it is here so an `AuthenticationError` on a request that looks identical to a working one is not mistaken for a revoked key.

## Optional configuration

| Option                 | Type                           | Default               | Effect                                                               |
| ---------------------- | ------------------------------ | --------------------- | -------------------------------------------------------------------- |
| `apiOrigin`            | `string`                       | `app.cloudcannon.com` | The API **host**. Leave unset against production                     |
| `client`               | `string`                       | `sdk`                 | Sent as `X-CC-Client`, identifying the caller in CloudCannon's logs  |
| `getCustomAuthHeaders` | `() => Record<string, string>` | —                     | Supplies the auth headers directly, bypassing both credential shapes |

**MUST pass `apiOrigin` as a bare host, with no scheme.** The client builds `https://<apiOrigin>/api/v0<path>`, so a value of `https://app.cloudcannon.com` produces a malformed URL.

**`getCustomAuthHeaders` replaces the default headers entirely.** When it is set, `key` and `userAccessKey` are never consulted. Set one or the other, not both — a client with a `key` and a `getCustomAuthHeaders` will silently ignore the key.

Set `client` when you are writing something that will make sustained use of the API. It costs one line and makes the traffic attributable; the CLI sets it to `cli/<version>`.

`CLOUDCANNON_API_ORIGIN` is a CLI environment variable, not an SDK one. The SDK's equivalent is the `apiOrigin` config option, and nothing reads the variable unless your own code does.
