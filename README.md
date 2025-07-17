# Commitment Game

A commitment-based challenge game where players bet on themselves to complete tasks, redeem their stake over time, and earn bonuses from those who quit.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run src/index.ts
```

This project was created using `bun init` in bun v1.1.38. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

Game Test Output - Generated on 2025-07-17T14:58:21.581Z
Test executed at: /Users/meimfhd/Personal/com-game/test-output-2025-07-17T14-58-21-576Z.txt
================================================================================

🔥 Starting Calorie Burn Challenge Game Test
Target: Burn 1000 calories with 5 checkpoints (200 calories each)
Stack size: $10.00, Players with different multipliers
============================================================

🎮 STEP 1: GameMaster creates the calorie burn game
✅ Game created: 1000 Calorie Burn Challenge
Stack size: $10.00
Total checkpoints: 5
Game ID: 7edb0954-b11b-4143-bae0-f6309c72a62e

👥 STEP 2: Players join the game
Alice joined with 2x multiplier = $20.00 stake
Bob joined with 1x multiplier = $10.00 stake
Charlie joined with 3x multiplier = $30.00 stake
Diana joined with 1x multiplier = $10.00 stake
Eve joined with 2x multiplier = $20.00 stake

💰 Total pool: $90.00
Players: 5/10

🚀 STEP 3: GameMaster starts the game
✅ Game started! State: IN_PROGRESS

🏃‍♀️ STEP 4: Players burn calories and submit proofs

👤 Alice's journey (completes all checkpoints):
📝 Submitted proof for checkpoint 1
✅ Checkpoint 1 approved by GameMaster
📝 Submitted proof for checkpoint 2
✅ Checkpoint 2 approved by GameMaster
📝 Submitted proof for checkpoint 3
✅ Checkpoint 3 approved by GameMaster
📝 Submitted proof for checkpoint 4
✅ Checkpoint 4 approved by GameMaster
📝 Submitted proof for checkpoint 5
✅ Checkpoint 5 approved by GameMaster

👤 Bob's journey (cashes out at checkpoint 3):
✅ Checkpoint 1 completed
✅ Checkpoint 2 completed
✅ Checkpoint 3 completed
💸 Bob cashed out: Cashout at checkpoint 3: $6.00

👤 Charlie's journey (completes all checkpoints):
✅ Checkpoint 1 completed
✅ Checkpoint 2 completed
✅ Checkpoint 3 completed
✅ Checkpoint 4 completed
✅ Checkpoint 5 completed

👤 Diana's journey (cashes out at checkpoint 2):
✅ Checkpoint 1 completed
✅ Checkpoint 2 completed
💸 Diana cashed out: Cashout at checkpoint 2: $4.00

👤 Eve's journey (cashes out at checkpoint 1):
✅ Checkpoint 1 completed
💸 Eve cashed out: Cashout at checkpoint 1: $4.00

🏁 STEP 5: GameMaster ends the game
✅ Game ended! Final state: ENDED

# 📊 FINAL RESULTS & PAYOUTS

💰 Financial Summary:
Total Pool: $90.00
Total Cashouts: $14.00
Bonus Pool: $26.00

🏆 Winners (completed all checkpoints):
Alice: - Original stake: $20.00 - Bonus won: $10.40 - Total payout: $30.40 - Net profit: $10.40
Charlie: - Original stake: $30.00 - Bonus won: $15.60 - Total payout: $45.60 - Net profit: $15.60

💸 Players who cashed out:
Bob: - Original stake: $10.00 - Cashed out at checkpoint 3: $6.00 - Forfeited: $4.00 - Net loss: $4.00
Diana: - Original stake: $10.00 - Cashed out at checkpoint 2: $4.00 - Forfeited: $6.00 - Net loss: $6.00
Eve: - Original stake: $20.00 - Cashed out at checkpoint 1: $4.00 - Forfeited: $16.00 - Net loss: $16.00

🧮 VERIFICATION:

✅ All calculations verified! Game completed successfully.
🎉 Alice and Charlie burned all 1000 calories and won bonuses!
💸 Bob, Diana, and Eve cashed out early but still got partial returns.
