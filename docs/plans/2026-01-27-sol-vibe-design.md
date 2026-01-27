# Sol Vibe - Solana 二元价格预测市场设计文档

## 概述

Sol Vibe 是一个基于 Sonic SVM 的二元预测市场，专注于加密货币价格预测。用户可以创建和参与 "BTC/ETH/SOL 价格在某时间点是否会达到目标价" 的预测市场。

### 核心特性

- **预测标的**: BTC / ETH / SOL 价格
- **定价机制**: CPMM (通过 Sega 实现)
- **Oracle**: Pyth Network
- **市场创建**: 开放（任何人可创建）
- **结算**: 管理员触发
- **技术栈**: Anchor + Next.js + React

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                 │
│         市场浏览 / 创建市场 / 查看持仓 / 结算领取         │
└───────────────┬─────────────────────────────────────────┘
                │
                ▼
┌───────────────────────┐   ┌─────────────────────────────┐
│    Market Factory     │   │        Settlement           │
│    (Anchor Program)   │   │     (Anchor Program)        │
│                       │   │                             │
│ • 创建市场 PDA        │   │ • 读取 Pyth 价格            │
│ • 铸造 YES/NO Token   │   │ • 判定市场结果              │
│ • 初始化流动性        │   │ • 用户赎回获胜代币          │
└───────────────────────┘   └──────────────┬──────────────┘
                                           │
                                           ▼
                                    ┌─────────────┐
                                    │ Pyth Oracle │
                                    └─────────────┘

┌─────────────────────────────────────────────────────────┐
│                   Sega (Sonic SVM)                      │
│              处理 YES/NO Token 交易撮合                  │
└─────────────────────────────────────────────────────────┘
```

### 核心账户结构

- **Market PDA**: 存储市场元数据（币种、目标价、截止时间、状态、结果）
- **YES Token Mint**: 该市场的 YES 代币铸造权限
- **NO Token Mint**: 该市场的 NO 代币铸造权限
- **Vault**: 托管用户存入的 SOL

---

## Market Factory 合约

### 指令（Instructions）

```rust
// 1. 创建市场
create_market {
    price_feed_id: Pubkey,    // Pyth 价格源 (BTC/USD, ETH/USD, SOL/USD)
    target_price: u64,         // 目标价格 (例: 100000 = $100,000)
    expiry_timestamp: i64,     // 截止时间戳
}

// 2. 购买初始代币（提供初始流动性）
mint_initial_tokens {
    market: Pubkey,
    sol_amount: u64,           // 存入的 SOL 数量
}
// → 按 1:1 铸造等量 YES 和 NO 代币给用户
// → SOL 存入 Vault
```

### Market 账户数据结构

```rust
pub struct Market {
    pub creator: Pubkey,           // 创建者
    pub price_feed_id: Pubkey,     // Pyth 价格源
    pub target_price: u64,         // 目标价格
    pub expiry_timestamp: i64,     // 截止时间
    pub yes_mint: Pubkey,          // YES 代币 mint
    pub no_mint: Pubkey,           // NO 代币 mint
    pub vault: Pubkey,             // SOL 托管账户
    pub total_sol_deposited: u64,  // 总存入 SOL
    pub status: MarketStatus,      // Pending / Settled
    pub outcome: Option<bool>,     // 结果: Some(true)=YES赢
    pub bump: u8,                  // PDA bump
}
```

### 流程

1. 用户调用 `create_market`，合约创建 Market PDA + 两个 Token Mint
2. 用户调用 `mint_initial_tokens` 存入 SOL，获得等量 YES + NO 代币
3. 用户将代币添加到 Sega 流动性池或直接在 Sega 交易

---

## Settlement 合约

### 指令（Instructions）

```rust
// 1. 结算市场（仅管理员）
settle_market {
    market: Pubkey,
}
// → 检查是否已过期
// → 读取 Pyth 当前价格
// → 比较目标价，设置 outcome (true = 价格 >= 目标)
// → 更新 status 为 Settled

// 2. 赎回代币（任何持有者）
redeem {
    market: Pubkey,
    amount: u64,               // 赎回的代币数量
}
// → 验证市场已结算
// → 销毁用户的获胜代币 (YES 或 NO)
// → 按比例从 Vault 转出 SOL
```

### 赎回计算逻辑

```
用户获得 SOL = (用户获胜代币数量 / 获胜代币总供应量) × Vault 总额
```

举例：
- Vault 有 1000 SOL
- YES 赢了，YES 总供应量 800 枚
- 用户持有 80 枚 YES
- 用户获得：80 / 800 × 1000 = **100 SOL**

### Pyth 集成

```rust
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

// 验证价格数据
let price_feed = &ctx.accounts.price_update;
let price = price_feed.get_price_no_older_than(
    &Clock::get()?,
    60,  // 最多60秒前的价格
    &market.price_feed_id,
)?;
```

### 安全检查

- 只有管理员能调用 `settle_market`
- 市场必须已过期才能结算
- 赎回只接受获胜方代币
- 防止重复赎回（销毁机制）

---

## 前端架构

### 页面结构

```
/                     → 首页：市场列表（进行中 / 已结算）
/market/[id]          → 市场详情：价格走势、交易入口、结算状态
/create               → 创建市场：选币种、设目标价、设截止时间
/portfolio            → 我的持仓：各市场 YES/NO 代币余额、可赎回金额
```

### 核心组件

```
components/
├── MarketCard        → 市场卡片（币种、目标价、倒计时、当前价格）
├── PriceChart        → 实时价格图（Pyth 数据）
├── TradePanel        → 交易面板（跳转 Sega）
├── CreateMarketForm  → 创建表单
├── RedeemButton      → 赎回按钮
└── WalletConnect     → 钱包连接
```

### 技术选型

| 功能 | 方案 |
|------|------|
| 框架 | Next.js 14 (App Router) |
| 样式 | Tailwind CSS |
| 钱包 | @solana/wallet-adapter-react |
| 合约交互 | @coral-xyz/anchor |
| 价格展示 | @pythnetwork/hermes-client |
| 状态管理 | React Query |

### 与 Sega 集成

交易按钮跳转到 Sega 页面进行 YES/NO 代币交易。

---

## 项目结构

```
sol-vibe-hack/
├── programs/
│   ├── market-factory/        # 市场创建合约
│   │   └── src/lib.rs
│   └── settlement/            # 结算合约
│       └── src/lib.rs
├── app/                       # Next.js 前端
│   ├── page.tsx              # 首页（市场列表）
│   ├── market/[id]/page.tsx  # 市场详情
│   ├── create/page.tsx       # 创建市场
│   ├── portfolio/page.tsx    # 我的持仓
│   └── components/           # UI 组件
├── tests/                     # Anchor 测试
├── Anchor.toml               # Anchor 配置
├── package.json
└── README.md
```

---

## 配置参考

### Sonic SVM 配置 (Anchor.toml)

```toml
[provider]
cluster = "https://api.testnet.sonic.game"
wallet = "~/.config/solana/id.json"

[programs.localnet]
market_factory = "..."
settlement = "..."
```

### Pyth Price Feed IDs (Sonic SVM)

- BTC/USD: `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43`
- ETH/USD: `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace`
- SOL/USD: `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d`
