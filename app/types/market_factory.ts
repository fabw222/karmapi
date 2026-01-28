/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/market_factory.json`.
 */
export type MarketFactory = {
  "address": "CCLkxLFFCiBW57nphnjr2QMEMTahwL77JQNRq57VB932",
  "metadata": {
    "name": "marketFactory",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "KarmaPi Market Factory Program"
  },
  "instructions": [
    {
      "name": "createMarket",
      "discriminator": [
        103,
        226,
        97,
        235,
        200,
        188,
        251,
        254
      ],
      "accounts": [
        {
          "name": "creator",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "creator"
              },
              {
                "kind": "account",
                "path": "betTokenMint"
              },
              {
                "kind": "arg",
                "path": "expiryTimestamp"
              }
            ]
          }
        },
        {
          "name": "betTokenMint"
        },
        {
          "name": "yesMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  121,
                  101,
                  115,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "noMint",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  110,
                  111,
                  95,
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "title",
          "type": "string"
        },
        {
          "name": "description",
          "type": "string"
        },
        {
          "name": "expiryTimestamp",
          "type": "i64"
        }
      ]
    },
    {
      "name": "placeBet",
      "discriminator": [
        222,
        62,
        67,
        220,
        63,
        166,
        126,
        33
      ],
      "accounts": [
        {
          "name": "bettor",
          "writable": true,
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "betTokenMint"
        },
        {
          "name": "yesMint",
          "writable": true
        },
        {
          "name": "noMint",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "bettorTokenAccount",
          "writable": true
        },
        {
          "name": "bettorYesAccount",
          "writable": true
        },
        {
          "name": "bettorNoAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "side",
          "type": "bool"
        }
      ]
    },
    {
      "name": "redeem",
      "discriminator": [
        184,
        12,
        86,
        149,
        70,
        196,
        97,
        225
      ],
      "accounts": [
        {
          "name": "redeemer",
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "vault",
          "writable": true
        },
        {
          "name": "winningMint",
          "writable": true
        },
        {
          "name": "redeemerWinningAccount",
          "writable": true
        },
        {
          "name": "redeemerBetAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "settleMarket",
      "discriminator": [
        193,
        153,
        95,
        216,
        166,
        6,
        144,
        217
      ],
      "accounts": [
        {
          "name": "creator",
          "signer": true
        },
        {
          "name": "market",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "outcome",
          "type": "bool"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "expiryInPast",
      "msg": "Expiry timestamp must be in the future"
    },
    {
      "code": 6001,
      "name": "titleTooLong",
      "msg": "Title exceeds maximum length of 128 characters"
    },
    {
      "code": 6002,
      "name": "descriptionTooLong",
      "msg": "Description exceeds maximum length of 512 characters"
    },
    {
      "code": 6003,
      "name": "marketNotOpen",
      "msg": "Market is not open"
    },
    {
      "code": 6004,
      "name": "marketExpired",
      "msg": "Market has expired"
    },
    {
      "code": 6005,
      "name": "invalidBetToken",
      "msg": "Invalid bet token"
    },
    {
      "code": 6006,
      "name": "invalidMint",
      "msg": "Invalid mint"
    },
    {
      "code": 6007,
      "name": "invalidVault",
      "msg": "Invalid vault"
    },
    {
      "code": 6008,
      "name": "invalidBetAmount",
      "msg": "Bet amount must be positive"
    },
    {
      "code": 6009,
      "name": "arithmeticOverflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6010,
      "name": "unauthorized",
      "msg": "Only the market creator can settle this market"
    },
    {
      "code": 6011,
      "name": "alreadySettled",
      "msg": "Market has already been settled"
    },
    {
      "code": 6012,
      "name": "marketNotExpired",
      "msg": "Market has not expired yet"
    },
    {
      "code": 6013,
      "name": "notSettled",
      "msg": "Market not settled yet"
    },
    {
      "code": 6014,
      "name": "wrongMint",
      "msg": "Wrong mint for redemption"
    },
    {
      "code": 6015,
      "name": "invalidAmount",
      "msg": "Amount must be positive"
    },
    {
      "code": 6016,
      "name": "noWinningBets",
      "msg": "No winning bets to redeem against"
    },
    {
      "code": 6017,
      "name": "vaultEmpty",
      "msg": "Vault is empty"
    },
    {
      "code": 6018,
      "name": "payoutTooSmall",
      "msg": "Payout amount is too small"
    }
  ],
  "types": [
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "creator",
            "type": "pubkey"
          },
          {
            "name": "title",
            "type": "string"
          },
          {
            "name": "description",
            "type": "string"
          },
          {
            "name": "betTokenMint",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "yesMint",
            "type": "pubkey"
          },
          {
            "name": "noMint",
            "type": "pubkey"
          },
          {
            "name": "yesPool",
            "type": "u64"
          },
          {
            "name": "noPool",
            "type": "u64"
          },
          {
            "name": "expiryTimestamp",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "marketStatus"
              }
            }
          },
          {
            "name": "outcome",
            "type": {
              "option": "bool"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "open"
          },
          {
            "name": "settled"
          }
        ]
      }
    }
  ]
};
