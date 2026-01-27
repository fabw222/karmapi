# KarmaPi - Solana 二元预测市场设计文档

## 概述

KarmaPi 是一个基于 Sonic SVM 的二元预测市场，支持通用事件预测（如政治、体育等），由市场创建者裁定结果。

用户可以使用任意 SPL 代币作为投注货币，采用**选边下注（Pari-mutuel）**模式。

### 核心特性

- **市场类型**: 通用事件预测
- **投注代币**: 创建者指定任意 SPL 代币（如 TRUMP、USDC）
- **投注机制**: 选边下注（池子模式），赢家瓜分输家的币
- **市场创建**: 开放（任何人可创建）
- **结算方式**: 创建者裁定
- **技术栈**: Anchor + Next.js + React

---

## 投注机制：选边下注（Pari-mutuel）

### 核心概念

用户直接选择 YES 或 NO 进行投注，所有投注汇入同一个池子，结算时赢家按比例瓜分全部池子（包括输家的投注）。

### 流程示例

```
市场："Trump 1/31 前打伊朗？"
投注代币：TRUMP

1. 用户 A 投 100 TRUMP 选 YES
   → 获得 100 "TRUMP-20260131-YES" 代币

2. 用户 B 投 200 TRUMP 选 NO
   → 获得 200 "TRUMP-20260131-NO" 代币

3. 用户 C 投 150 TRUMP 选 YES
   → 获得 150 "TRUMP-20260131-YES" 代币

池子状态：
├── YES 池：250 TRUMP（A: 100, C: 150）
├── NO 池：200 TRUMP（B: 200）
└── 总池：450 TRUMP

实时赔率：
├── YES 赔率 = 450 / 250 = 1.8x
└── NO 赔率 = 450 / 200 = 2.25x
```

### 结算计算

```
如果 YES 赢：
├── 总池 450 TRUMP 归 YES 持有者
├── 用户 A：100/250 × 450 = 180 TRUMP（净赚 80）
└── 用户 C：150/250 × 450 = 270 TRUMP（净赚 120）

如果 NO 赢：
├── 总池 450 TRUMP 归 NO 持有者
└── 用户 B：200/200 × 450 = 450 TRUMP（净赚 250）
```

### 赔率公式

```
YES 赔率 = (yes_pool + no_pool) / yes_pool
NO 赔率 = (yes_pool + no_pool) / no_pool
```

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                      Frontend (Next.js)                 │
│      市场浏览 / 创建市场 / 选边投注 / 裁定 / 赎回         │
└───────────────┬─────────────────────────────────────────┘
                │
                ▼
┌───────────────────────┐   ┌─────────────────────────────┐
│    Market Factory     │   │        Settlement           │
│    (Anchor Program)   │   │     (Anchor Program)        │
│                       │   │                             │
│ • create_market       │   │ • settle_market             │
│ • place_bet           │   │   (创建者裁定)               │
│                       │   │ • redeem                    │
└───────────────────────┘   └─────────────────────────────┘
```

---

## Market Factory 合约

### Market 账户数据结构

```rust
pub struct Market {
    pub creator: Pubkey,           // 创建者（裁定人）
    pub title: String,             // 市场标题
    pub description: String,       // 详细描述/规则

    // 投注代币
    pub bet_token_mint: Pubkey,    // 投注代币 CA（如 TRUMP）
    pub vault: Pubkey,             // 托管所有投注

    // YES/NO 代币
    pub yes_mint: Pubkey,          // "TRUMP-20260131-YES"
    pub no_mint: Pubkey,           // "TRUMP-20260131-NO"

    // 池子统计
    pub yes_pool: u64,             // YES 方总投注量
    pub no_pool: u64,              // NO 方总投注量

    // 时间和状态
    pub expiry_timestamp: i64,
    pub status: MarketStatus,      // Open / Settled
    pub outcome: Option<bool>,     // Some(true)=YES赢

    pub bump: u8,
}

pub enum MarketStatus {
    Open,
    Settled,
}
```

### 指令（Instructions）

```rust
// 创建市场
create_market {
    bet_token_mint: Pubkey,    // 投注代币 CA
    title: String,             // "Trump 1/31前打伊朗?"
    description: String,       // 详细规则描述
    expiry_timestamp: i64,     // 截止时间
}

// 选边下注
place_bet {
    market: Pubkey,
    amount: u64,               // 投注代币数量
    side: bool,                // true = YES, false = NO
}
// → 从用户转入投注代币到 Vault
// → 铸造对应方向的代币给用户（YES 或 NO）
// → 更新 yes_pool 或 no_pool
```

### 用户流程示例

```
1. 创建者发起市场：
   "Trump 1/31前打伊朗？"
   投注代币：TRUMP (CA: 6p6x...)
   截止时间：2026-01-31 00:00 UTC

2. 用户 A 投 100 TRUMP 选 YES
   → 获得 100 "TRUMP-20260131-YES" 代币

3. 用户 B 投 200 TRUMP 选 NO
   → 获得 200 "TRUMP-20260131-NO" 代币

4. 截止后，创建者裁定：YES 赢

5. 用户 A 赎回 100 YES
   → 获得 100/100 × 300 = 300 TRUMP（净赚 200）
```

---

## Settlement 合约

### 指令（Instructions）

```rust
// 结算市场（仅创建者）
settle_market {
    market: Pubkey,
    outcome: bool,             // true = YES 赢, false = NO 赢
}
// → 验证 caller == market.creator
// → 验证已过期
// → 设置 outcome
// → 更新 status 为 Settled

// 赎回代币（任何持有者）
redeem {
    market: Pubkey,
    amount: u64,               // 赎回的代币数量
}
// → 验证市场已结算
// → 验证用户持有获胜方代币
// → 计算份额：amount / winning_pool × total_pool
// → 销毁代币，转出投注代币
```

### 赎回计算逻辑（池子模式）

```
total_pool = yes_pool + no_pool
winning_pool = outcome ? yes_pool : no_pool

用户获得代币 = (用户获胜代币数量 / winning_pool) × total_pool
```

举例：
- YES 池：250 TRUMP
- NO 池：200 TRUMP
- 总池：450 TRUMP
- YES 赢了
- 用户持有 100 YES
- 用户获得：100 / 250 × 450 = **180 TRUMP**（净赚 80）

### 安全检查

- 只有创建者能裁定结果
- 市场必须已过期才能结算
- 赎回只接受获胜方代币
- 防止重复赎回（销毁机制）

### 风险提示

市场由创建者裁定，存在作恶风险。用户需信任创建者信誉。

可选的未来改进：
- 创建者需质押保证金
- 争议投票机制
- 信誉系统

---

## 前端架构

### 页面结构

```
/                     → 首页：市场列表（进行中 / 已结算）
/market/[id]          → 市场详情：赔率、投注、结算状态
/create               → 创建市场：填写参数
/portfolio            → 我的持仓 + 我创建的市场（可裁定）
```

### 市场详情页（核心交互）

```
┌─────────────────────────────────────────────────┐
│            市场详情页 /market/[id]               │
├─────────────────────────────────────────────────┤
│  🎯 Trump 1/31前打伊朗?                          │
│  投注代币: TRUMP                                 │
│  创建者: 7xK2...（裁定人）                        │
│  截止: 2026-01-31 00:00 UTC                     │
│                                                 │
│  ┌─────────────┬─────────────┐                  │
│  │    YES      │     NO      │                  │
│  │   1.8x      │   2.25x     │  ← 实时赔率      │
│  │  250 TRUMP  │  200 TRUMP  │  ← 池子大小      │
│  └─────────────┴─────────────┘                  │
│                                                 │
│  投注数量: [____100____] TRUMP                   │
│                                                 │
│  [投注 YES]     [投注 NO]                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 市场卡片展示

```
┌─────────────────────────────────────┐
│ 🎯 Trump 1/31前打伊朗?              │
│ 投注代币: TRUMP                      │
│ YES 1.8x | NO 2.25x                 │  ← 赔率预览
│ 总池: 450 TRUMP                      │
│ 截止: 2026-01-31                    │
│ [参与投注]                           │
└─────────────────────────────────────┘
```

### 我的持仓页面

```
/portfolio
├── 我创建的市场（可裁定）
│   └── [裁定 YES] [裁定 NO] 按钮（截止后出现）
│
└── 我参与的市场
    ├── 进行中：显示持仓和当前价值
    └── 已结算：[赎回] 按钮（仅获胜方）
```

### 核心组件

```
components/
├── MarketCard        → 市场卡片（含赔率预览）
├── BetPanel          → 选边投注面板
├── OddsDisplay       → 赔率和池子显示
├── CreateMarketForm  → 创建表单
├── SettleButton      → 裁定按钮（仅创建者）
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
| 状态管理 | React Query |

---

## 项目结构

```
karmapi/
├── programs/
│   ├── market-factory/
│   │   └── src/lib.rs
│   │       ├── create_market
│   │       └── place_bet
│   └── settlement/
│       └── src/lib.rs
│           ├── settle_market
│           └── redeem
├── app/
│   ├── page.tsx              # 首页（市场列表）
│   ├── market/[id]/page.tsx  # 市场详情 + 投注
│   ├── create/page.tsx       # 创建市场
│   ├── portfolio/page.tsx    # 我的持仓 + 裁定
│   └── components/
│       ├── MarketCard.tsx
│       ├── BetPanel.tsx
│       ├── OddsDisplay.tsx
│       ├── CreateMarketForm.tsx
│       ├── SettleButton.tsx
│       └── RedeemButton.tsx
├── tests/
├── Anchor.toml
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

---

## 功能清单

| 功能 | 描述 |
|------|------|
| 创建市场 | 标题 + 描述 + 投注代币 + 截止时间 |
| 选边投注 | 选 YES/NO，存入投注代币，获得对应代币 |
| 实时赔率 | 显示 YES/NO 赔率和池子大小 |
| 裁定结果 | 创建者判定 YES/NO 获胜 |
| 赎回 | 获胜方按比例瓜分全部池子 |
