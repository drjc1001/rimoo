---
id: T-017
title: 半天驗證：前五個摩擦，公開 Skill 目錄裡有沒有真的對得上的
type: spike
source: docs/rimoo_friction_skill_recommendation_spec.md 票 6～9 的前提；Fable 的洞 3「推薦不如產生」
priority: P2
created: 2026-09-28
---
## 需求
- 拿 T-016 的前五類摩擦（沒跑完就用 T-012 的：糾正最多的五類），手動到 Anthropic 官方目錄（`anthropics/claude-plugins-official`）、`mattpocock/skills`、再挑兩個公開 marketplace，找有沒有 Skill 真的針對那個摩擦。
- 每一類寫：找到什麼、它做的是「偏好」（一句 CLAUDE.md 就能解）還是「能力」（要跑測試、看 log 的流程）、跟 Rimoo 自己產的規則比誰贏。
- 結論二選一：有供給 → 開 spec 票 6～9（目錄、正規化、推薦引擎、解釋）；沒有 → 主線是「產生」，spec §21 改成主線，推薦引擎不開。

## 被誰擋住
- 無（用 T-012 的分類就能開始）。

## 驗收
- 一張五列的對照表在票裡，Jasper 看表裁。
