# Economy

Resources include gold, clan coins, energy, materials, crystals and premium credits. Premium credits are internal game currency and are not withdrawable money.

Sources: combat, quests, events, crafting/gathering, daily rewards and configured rewards. Sinks: crafting gold costs, Bastion upgrades, equipment systems, market tax and cosmetics/convenience.

The player market is internal-currency only and transfers item ownership atomically. Purchases use idempotency keys. Runtime pricing lives in `runtime_config` so balance changes do not require redeploy.

`web3` and `real_money_withdrawals` feature flags default to false. Founder content, if ever enabled, is a content purchase, never an investment or return promise.